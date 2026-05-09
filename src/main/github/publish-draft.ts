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

  const title = request.title.trim() || 'Untitled draft'
  const labels = request.labels
  const createdIssue = await createIssue(repo.owner, repo.name, {
    title,
    body: request.body,
    labels: labels.length > 0 ? labels : undefined
  })

  db.transaction((tx) => {
    const now = new Date().toISOString()

    tx.update(issueDrafts)
      .set({
        title,
        body: request.body,
        labels: JSON.stringify(labels),
        status: 'published',
        githubIssueUrl: createdIssue.url,
        updatedAt: now
      })
      .where(eq(issueDrafts.id, draft.id))
      .run()

    tx.insert(publishLog)
      .values({
        id: uuidv4(),
        draftId: draft.id,
        repoId: draft.repoId,
        githubIssueUrl: createdIssue.url,
        publishedAt: now
      })
      .run()

    if (draft.sourceNoteIds.length > 0) {
      tx.update(notes)
        .set({ status: 'published', updatedAt: now })
        .where(and(inArray(notes.id, draft.sourceNoteIds), eq(notes.repoId, draft.repoId)))
        .run()
    }
  })

  const published = getIssueDraftById(db, draft.id)
  if (!published) throw new Error('Published draft could not be loaded')
  return published
}
