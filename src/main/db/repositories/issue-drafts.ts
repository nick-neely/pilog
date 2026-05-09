import { desc, eq, inArray } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { issueDrafts, notes } from '../schema'
import type { GeneratedIssueDraft, IssueDraft, IssueDraftForReview } from '@shared/types'

const issueDraftColumns = {
  id: issueDrafts.id,
  repoId: issueDrafts.repoId,
  title: issueDrafts.title,
  body: issueDrafts.body,
  labels: issueDrafts.labels,
  sourceNoteIds: issueDrafts.sourceNoteIds,
  affectedFilesJson: issueDrafts.affectedFilesJson,
  confidence: issueDrafts.confidence,
  groupingReason: issueDrafts.groupingReason,
  status: issueDrafts.status,
  githubIssueUrl: issueDrafts.githubIssueUrl,
  createdAt: issueDrafts.createdAt,
  updatedAt: issueDrafts.updatedAt
} as const

const sourceNoteColumns = {
  id: notes.id,
  content: notes.content,
  status: notes.status,
  repoId: notes.repoId,
  runId: notes.runId,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt
} as const

export function createIssueDraft(
  db: PilogDatabase,
  input: { repoId: string; draft: GeneratedIssueDraft }
): IssueDraft {
  const now = new Date().toISOString()
  const id = uuidv4()
  const body = formatIssueDraftBody(input.draft)

  db.insert(issueDrafts)
    .values({
      id,
      repoId: input.repoId,
      title: input.draft.title,
      body,
      labels: JSON.stringify(input.draft.suggestedLabels),
      sourceNoteIds: JSON.stringify(input.draft.sourceNoteIds),
      affectedFilesJson: JSON.stringify(input.draft.affectedFiles),
      confidence: input.draft.confidence,
      groupingReason: input.draft.groupingReason,
      status: 'draft',
      createdAt: now,
      updatedAt: now
    })
    .run()

  return {
    id,
    repoId: input.repoId,
    title: input.draft.title,
    body,
    labels: input.draft.suggestedLabels,
    sourceNoteIds: input.draft.sourceNoteIds,
    affectedFiles: input.draft.affectedFiles,
    confidence: input.draft.confidence,
    groupingReason: input.draft.groupingReason,
    status: 'draft',
    githubIssueUrl: null,
    createdAt: now,
    updatedAt: now
  }
}

export function listIssueDrafts(db: PilogDatabase): IssueDraft[] {
  return db
    .select(issueDraftColumns)
    .from(issueDrafts)
    .orderBy(desc(issueDrafts.createdAt))
    .all()
    .map(mapIssueDraft)
}

export function listIssueDraftsForReview(db: PilogDatabase): IssueDraftForReview[] {
  const drafts = listIssueDrafts(db)
  const sourceNoteIds = [...new Set(drafts.flatMap((draft) => draft.sourceNoteIds))]

  if (sourceNoteIds.length === 0) {
    return drafts.map((draft) => ({ ...draft, sourceNotes: [] }))
  }

  const sourceNotes = db
    .select(sourceNoteColumns)
    .from(notes)
    .where(inArray(notes.id, sourceNoteIds))
    .all()
  const sourceNotesById = new Map(sourceNotes.map((note) => [note.id, note]))

  return drafts.map((draft) => ({
    ...draft,
    sourceNotes: draft.sourceNoteIds
      .map((id) => sourceNotesById.get(id))
      .filter((note): note is NonNullable<typeof note> => note !== undefined)
  }))
}

export function updateIssueDraft(
  db: PilogDatabase,
  input: { id: string; title: string; body: string; labels: string[] }
): IssueDraft | null {
  const existing = db
    .select({ updatedAt: issueDrafts.updatedAt })
    .from(issueDrafts)
    .where(eq(issueDrafts.id, input.id))
    .get()

  if (!existing) return null

  const now = nextUpdatedAt(existing.updatedAt)

  db.update(issueDrafts)
    .set({
      title: input.title,
      body: input.body,
      labels: JSON.stringify(input.labels),
      updatedAt: now
    })
    .where(eq(issueDrafts.id, input.id))
    .run()

  const row = db
    .select(issueDraftColumns)
    .from(issueDrafts)
    .where(eq(issueDrafts.id, input.id))
    .get()

  return row ? mapIssueDraft(row) : null
}

function nextUpdatedAt(previousUpdatedAt: string): string {
  const now = new Date()
  const previous = new Date(previousUpdatedAt)
  if (now <= previous) now.setTime(previous.getTime() + 1)

  return now.toISOString()
}

function mapIssueDraft(row: typeof issueDrafts.$inferSelect): IssueDraft {
  return {
    id: row.id,
    repoId: row.repoId,
    title: row.title,
    body: row.body,
    labels: JSON.parse(row.labels),
    sourceNoteIds: JSON.parse(row.sourceNoteIds),
    affectedFiles: JSON.parse(row.affectedFilesJson),
    confidence: row.confidence,
    groupingReason: row.groupingReason,
    status: row.status,
    githubIssueUrl: row.githubIssueUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function formatIssueDraftBody(draft: GeneratedIssueDraft): string {
  const lines = [
    draft.summary,
    '',
    '## Context',
    draft.context,
    '',
    '## Acceptance Criteria',
    ...draft.acceptanceCriteria.map((item) => `- ${item}`)
  ]

  if (draft.implementationNotes.length > 0) {
    lines.push(
      '',
      '## Implementation Notes',
      ...draft.implementationNotes.map((item) => `- ${item}`)
    )
  }

  if (draft.needsClarification && draft.needsClarification.length > 0) {
    lines.push('', '## Needs Clarification', ...draft.needsClarification.map((item) => `- ${item}`))
  }

  return lines.join('\n')
}
