import { desc, eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { publishLog } from '../schema'
import type { PublishLogEntry } from '@shared/ipc'

const publishLogColumns = {
  id: publishLog.id,
  draftId: publishLog.draftId,
  repoId: publishLog.repoId,
  githubIssueUrl: publishLog.githubIssueUrl,
  publishedAt: publishLog.publishedAt
} as const

export function recordPublish(
  db: PilogDatabase,
  input: { draftId: string | null; repoId: string; githubIssueUrl: string }
): PublishLogEntry {
  const id = uuidv4()
  const publishedAt = new Date().toISOString()

  db.insert(publishLog)
    .values({
      id,
      draftId: input.draftId ?? undefined,
      repoId: input.repoId,
      githubIssueUrl: input.githubIssueUrl,
      publishedAt
    })
    .run()

  return {
    id,
    draftId: input.draftId,
    repoId: input.repoId,
    githubIssueUrl: input.githubIssueUrl,
    publishedAt
  }
}

export function listPublishLog(db: PilogDatabase, filter: { repoId: string }): PublishLogEntry[] {
  return db
    .select(publishLogColumns)
    .from(publishLog)
    .where(eq(publishLog.repoId, filter.repoId))
    .orderBy(desc(publishLog.publishedAt))
    .all()
}
