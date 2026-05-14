import { desc, eq, inArray } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { issueDrafts, notes, publishLog, repos } from '../schema'
import type { PublishAuditLogEntry, PublishLogEntry } from '@shared/ipc'
import type { IssueDraftSourceNote } from '@shared/types'
import { mapNoteRow } from './notes'
import { mapRepoRow, repoColumns } from './repos'

const publishLogColumns = {
  id: publishLog.id,
  draftId: publishLog.draftId,
  repoId: publishLog.repoId,
  githubIssueUrl: publishLog.githubIssueUrl,
  publishedAt: publishLog.publishedAt
} as const

const sourceNoteColumns = {
  id: notes.id,
  content: notes.content,
  status: notes.status,
  repoId: notes.repoId,
  runId: notes.runId,
  captureContext: notes.captureContext,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt
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

export function listPublishAuditLog(
  db: PilogDatabase,
  filter: { repoId?: string } = {}
): PublishAuditLogEntry[] {
  const baseQuery = db
    .select({
      id: publishLog.id,
      draftId: publishLog.draftId,
      repoId: publishLog.repoId,
      githubIssueUrl: publishLog.githubIssueUrl,
      publishedAt: publishLog.publishedAt,
      repo: repoColumns,
      draftTitle: issueDrafts.title,
      sourceNoteIdsJson: issueDrafts.sourceNoteIds
    })
    .from(publishLog)
    .innerJoin(repos, eq(publishLog.repoId, repos.id))
    .leftJoin(issueDrafts, eq(publishLog.draftId, issueDrafts.id))

  const rows = (filter.repoId ? baseQuery.where(eq(publishLog.repoId, filter.repoId)) : baseQuery)
    .orderBy(desc(publishLog.publishedAt))
    .all()

  const rowsWithSourceNoteIds = rows.map((row) => ({
    ...row,
    sourceNoteIds: parseJsonStringArray(row.sourceNoteIdsJson)
  }))
  const sourceNotesById = getSourceNotesById(
    db,
    rowsWithSourceNoteIds.flatMap((row) => row.sourceNoteIds)
  )

  return rowsWithSourceNoteIds.map((row) => {
    const sourceNotes = row.sourceNoteIds
      .map((id) => sourceNotesById.get(id))
      .filter((note): note is IssueDraftSourceNote => note !== undefined)

    return {
      id: row.id,
      draftId: row.draftId,
      repoId: row.repoId,
      githubIssueUrl: row.githubIssueUrl,
      publishedAt: row.publishedAt,
      repo: mapRepoRow(row.repo),
      draftTitle: row.draftTitle,
      sourceNotes
    }
  })
}

function parseJsonStringArray(value: string | null): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function getSourceNotesById(
  db: PilogDatabase,
  sourceNoteIds: string[]
): Map<string, IssueDraftSourceNote> {
  const uniqueSourceNoteIds = [...new Set(sourceNoteIds)]
  if (uniqueSourceNoteIds.length === 0) return new Map()

  const sourceNotes = db
    .select(sourceNoteColumns)
    .from(notes)
    .where(inArray(notes.id, uniqueSourceNoteIds))
    .all()

  return new Map(sourceNotes.map((note) => [note.id, mapNoteRow(note)]))
}
