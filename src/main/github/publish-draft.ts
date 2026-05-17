import { and, eq, inArray } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type {
  CreatedIssue,
  GitHubLabel,
  PublishAutoPublishRunRequest,
  PublishIssueDraftRequest,
  UndoAutoPublishRunRequest
} from '@shared/ipc'
import { filterLabelsForPublish } from '@shared/labels'
import type {
  AutoPublishPublishReport,
  AutoPublishSkippedDraft,
  AutoPublishUndoReport,
  IssueDraft
} from '@shared/types'
import type { PilogDatabase } from '../db/client'
import { issueDrafts, notes, publishLog } from '../db/schema'
import { getIssueDraftById } from '../db/repositories/issue-drafts'
import { getRepoById } from '../db/repositories/repos'
import { getRunById } from '../db/repositories/agent-runs'

type CreateIssueClient = (
  owner: string,
  repo: string,
  payload: { title: string; body: string; labels?: string[] }
) => Promise<CreatedIssue>

type ListLabelsClient = (owner: string, repo: string) => Promise<Array<Pick<GitHubLabel, 'name'>>>

type CommentIssueClient = (
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) => Promise<{ url: string | null }>

type CloseIssueClient = (owner: string, repo: string, issueNumber: number) => Promise<void>

type PublishClients =
  | CreateIssueClient
  | {
      createIssue: CreateIssueClient
      listLabels: ListLabelsClient
    }

type ReviewedDraftPayload = {
  title: string
  body: string
  labels: string[]
}

export async function publishReviewedDraft(
  db: PilogDatabase,
  request: PublishIssueDraftRequest,
  clients: PublishClients
): Promise<IssueDraft> {
  const draft = getIssueDraftById(db, request.id)
  if (!draft) throw new Error('Draft not found')
  if (draft.status === 'published') throw new Error('Draft has already been published')
  if (draft.workflowState === 'needs_clarification') {
    throw new Error('Clarification drafts must be answered before publishing')
  }

  const repo = getRepoById(db, draft.repoId)
  if (!repo) throw new Error('Linked repository not found')

  const publishClients = normalizePublishClients(clients)
  const reviewedDraft: ReviewedDraftPayload = {
    title: request.title.trim() || 'Untitled draft',
    body: request.body,
    labels: await resolveLabelsForPublish({ request, repo, listLabels: publishClients.listLabels })
  }
  const createdIssue = await publishClients.createIssue(repo.owner, repo.name, {
    title: reviewedDraft.title,
    body: reviewedDraft.body,
    labels: reviewedDraft.labels.length > 0 ? reviewedDraft.labels : undefined
  })

  recordLocalPublishState(db, {
    draft,
    reviewedDraft,
    githubIssueUrl: createdIssue.url
  })

  const published = getIssueDraftById(db, draft.id)
  if (!published) throw new Error('Published draft could not be loaded')
  return published
}

export async function publishAutoPublishRun(
  db: PilogDatabase,
  request: PublishAutoPublishRunRequest,
  clients: PublishClients
): Promise<AutoPublishPublishReport> {
  const run = getRunById(db, request.runId)
  if (!run) throw new Error('Auto-publish run not found')
  if (run.status !== 'succeeded') throw new Error('Auto-publish run is not ready to publish')
  if (!run.repoId) throw new Error('Auto-publish run is missing a linked repository')
  const repo = getRepoById(db, run.repoId)
  if (!repo) throw new Error('Linked repository not found')

  const successes: AutoPublishPublishReport['successes'] = []
  const failures: AutoPublishPublishReport['failures'] = []
  const skippedDrafts = getSkippedDraftsFromRun(run.eventStream)

  for (const draftId of run.outputDraftIds) {
    const draft = getIssueDraftById(db, draftId)
    if (!draft) {
      failures.push({
        draftId,
        title: 'Missing draft',
        sourceNoteIds: [],
        labels: [],
        error: 'Draft could not be loaded.'
      })
      continue
    }

    try {
      const published = await publishReviewedDraft(
        db,
        {
          id: draft.id,
          title: draft.title,
          body: draft.body,
          labels: draft.labels
        },
        clients
      )
      successes.push({
        draftId: published.id,
        title: published.title,
        sourceNoteIds: published.sourceNoteIds,
        labels: published.labels,
        githubIssueUrl: published.githubIssueUrl ?? '',
        githubIssueNumber: createdIssueNumberFromUrl(published.githubIssueUrl) ?? 0
      })
    } catch (error) {
      failures.push({
        draftId: draft.id,
        title: draft.title,
        sourceNoteIds: draft.sourceNoteIds,
        labels: draft.labels,
        error: formatPublishError(error)
      })
    }
  }

  return {
    runId: run.id,
    repoId: run.repoId,
    repo: {
      id: repo.id,
      owner: repo.owner,
      name: repo.name
    },
    publishedAt: new Date().toISOString(),
    successCount: successes.length,
    failureCount: failures.length,
    skippedCount: skippedDrafts.length,
    successes,
    failures,
    skippedDrafts
  }
}

export async function undoAutoPublishRun(
  db: PilogDatabase,
  request: UndoAutoPublishRunRequest,
  clients: { commentIssue: CommentIssueClient; closeIssue: CloseIssueClient }
): Promise<AutoPublishUndoReport> {
  const run = getRunById(db, request.runId)
  if (!run) throw new Error('Auto-publish run not found')
  if (run.repoId !== request.repoId) throw new Error('Auto-publish run does not match repository')
  const repo = getRepoById(db, request.repoId)
  if (!repo) throw new Error('Linked repository not found')

  const successes: AutoPublishUndoReport['successes'] = []
  const failures: AutoPublishUndoReport['failures'] = []

  for (const issue of request.issues) {
    const issueNumber = issue.githubIssueNumber || createdIssueNumberFromUrl(issue.githubIssueUrl)
    if (!issueNumber) {
      failures.push({
        ...issue,
        githubIssueNumber: 0,
        stage: 'comment',
        error: 'GitHub issue number could not be determined.'
      })
      continue
    }

    try {
      const comment = await clients.commentIssue(
        repo.owner,
        repo.name,
        issueNumber,
        buildPublishUndoAuditComment(request.runId)
      )

      try {
        await clients.closeIssue(repo.owner, repo.name, issueNumber)
        successes.push({
          ...issue,
          githubIssueNumber: issueNumber,
          auditCommentUrl: comment.url,
          closedAt: new Date().toISOString()
        })
      } catch (error) {
        failures.push({
          ...issue,
          githubIssueNumber: issueNumber,
          stage: 'close',
          error: formatPublishError(error)
        })
      }
    } catch (error) {
      failures.push({
        ...issue,
        githubIssueNumber: issueNumber,
        stage: 'comment',
        error: formatPublishError(error)
      })
    }
  }

  return {
    runId: request.runId,
    repoId: request.repoId,
    attemptedAt: new Date().toISOString(),
    successCount: successes.length,
    failureCount: failures.length,
    successes,
    failures
  }
}

function getSkippedDraftsFromRun(eventStream: unknown[]): AutoPublishSkippedDraft[] {
  for (let index = eventStream.length - 1; index >= 0; index -= 1) {
    const event = eventStream[index]
    if (!isRecord(event)) continue
    const preview = event.autoPublishPreview
    if (!isRecord(preview) || !Array.isArray(preview.skippedDrafts)) continue

    return preview.skippedDrafts.flatMap((draft) => {
      const skippedDraft = normalizeSkippedDraft(draft)
      return skippedDraft ? [skippedDraft] : []
    })
  }

  return []
}

function normalizeSkippedDraft(input: unknown): AutoPublishSkippedDraft | null {
  if (!isRecord(input)) {
    return null
  }
  const reason = typeof input.reason === 'string' ? input.reason : ''
  if (!reason) return null

  return {
    title: typeof input.title === 'string' && input.title.trim() ? input.title : 'Skipped draft',
    reason,
    sourceNoteIds: stringArray(input.sourceNoteIds),
    labels: stringArray(input.labels)
  }
}

function buildPublishUndoAuditComment(runId: string): string {
  return `Pilog Publish Undo requested for run ${runId}. Closing this issue for auditability; the original Pilog publish log and local issue draft remain unchanged.`
}

function createdIssueNumberFromUrl(url: string | null | undefined): number | null {
  if (!url) return null
  const match = /\/issues\/(\d+)(?:$|[/?#])/.exec(url)
  if (!match) return null
  const number = Number(match[1])
  return Number.isInteger(number) && number > 0 ? number : null
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null
}

function stringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((value): value is string => typeof value === 'string')
}

function normalizePublishClients(clients: PublishClients): {
  createIssue: CreateIssueClient
  listLabels: ListLabelsClient | null
} {
  if (typeof clients === 'function') {
    return {
      createIssue: clients,
      listLabels: null
    }
  }

  return clients
}

async function resolveLabelsForPublish(input: {
  request: PublishIssueDraftRequest
  repo: { owner: string; name: string }
  listLabels: ListLabelsClient | null
}): Promise<string[]> {
  if (!input.listLabels) return input.request.labels

  const repoLabels = await input.listLabels(input.repo.owner, input.repo.name)
  return filterLabelsForPublish({
    labels: input.request.labels,
    repoLabels,
    keptUnmatchedLabels: input.request.keptUnmatchedLabels
  })
}

function recordLocalPublishState(
  db: PilogDatabase,
  input: {
    draft: IssueDraft
    reviewedDraft: ReviewedDraftPayload
    githubIssueUrl: string
  }
): void {
  db.transaction((tx) => {
    const now = new Date().toISOString()

    tx.update(issueDrafts)
      .set({
        title: input.reviewedDraft.title,
        body: input.reviewedDraft.body,
        labels: JSON.stringify(input.reviewedDraft.labels),
        status: 'published',
        githubIssueUrl: input.githubIssueUrl,
        updatedAt: now
      })
      .where(eq(issueDrafts.id, input.draft.id))
      .run()

    tx.insert(publishLog)
      .values({
        id: uuidv4(),
        draftId: input.draft.id,
        repoId: input.draft.repoId,
        githubIssueUrl: input.githubIssueUrl,
        publishedAt: now
      })
      .run()

    if (input.draft.sourceNoteIds.length > 0) {
      tx.update(notes)
        .set({ status: 'published', updatedAt: now })
        .where(
          and(inArray(notes.id, input.draft.sourceNoteIds), eq(notes.repoId, input.draft.repoId))
        )
        .run()
    }
  })
}

function formatPublishError(error: unknown): string {
  const status = getErrorStatus(error)
  const statusText = typeof status === 'number' ? `GitHub ${status}: ` : ''
  const message = error instanceof Error ? error.message : String(error)
  return `${statusText}${message || 'Publish failed.'}`
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined
  }

  return typeof error.status === 'number' ? error.status : undefined
}
