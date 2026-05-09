import { and, eq, inArray } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { CreatedIssue, PublishIssueDraftRequest } from '@shared/ipc'
import type { IssueDraft } from '@shared/types'
import type { PilogDatabase } from '../db/client'
import { issueDrafts, notes, publishLog } from '../db/schema'
import { getIssueDraftById } from '../db/repositories/issue-drafts'
import { getRepoById } from '../db/repositories/repos'

type CreateIssueClient = (
  owner: string,
  repo: string,
  payload: { title: string; body: string; labels?: string[] }
) => Promise<CreatedIssue>

type ReviewedDraftPayload = {
  title: string
  body: string
  labels: string[]
}

export async function publishReviewedDraft(
  db: PilogDatabase,
  request: PublishIssueDraftRequest,
  createIssue: CreateIssueClient
): Promise<IssueDraft> {
  const draft = getIssueDraftById(db, request.id)
  if (!draft) throw new Error('Draft not found')
  if (draft.status === 'published') throw new Error('Draft has already been published')

  const repo = getRepoById(db, draft.repoId)
  if (!repo) throw new Error('Linked repository not found')

  const reviewedDraft: ReviewedDraftPayload = {
    title: request.title.trim() || 'Untitled draft',
    body: request.body,
    labels: request.labels
  }
  const createdIssue = await createIssue(repo.owner, repo.name, {
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
