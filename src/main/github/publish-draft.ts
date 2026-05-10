import { and, eq, inArray } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type {
  CreatedIssue,
  GitHubLabel,
  PublishAutoPublishRunRequest,
  PublishIssueDraftRequest
} from '@shared/ipc'
import { filterLabelsForPublish } from '@shared/labels'
import type { AutoPublishPublishReport, IssueDraft } from '@shared/types'
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

  const successes: AutoPublishPublishReport['successes'] = []
  const failures: AutoPublishPublishReport['failures'] = []

  for (const draftId of run.outputDraftIds) {
    const draft = getIssueDraftById(db, draftId)
    if (!draft) {
      failures.push({
        draftId,
        title: 'Missing draft',
        sourceNoteIds: [],
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
        githubIssueUrl: published.githubIssueUrl ?? ''
      })
    } catch (error) {
      failures.push({
        draftId: draft.id,
        title: draft.title,
        sourceNoteIds: draft.sourceNoteIds,
        error: formatPublishError(error)
      })
    }
  }

  return {
    runId: run.id,
    repoId: run.repoId,
    successCount: successes.length,
    failureCount: failures.length,
    successes,
    failures
  }
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
