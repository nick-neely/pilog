import { desc, eq, inArray } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { issueDrafts, notes } from '../schema'
import type {
  GeneratedIssueDraft,
  IssueDraft,
  IssueDraftForReview,
  IssueDraftStatus
} from '@shared/types'

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

export function listIssueDrafts(
  db: PilogDatabase,
  filter: { status?: IssueDraftStatus | 'all' } = {}
): IssueDraft[] {
  const status = filter.status ?? 'draft'
  const query = db.select(issueDraftColumns).from(issueDrafts)
  const filtered = status === 'all' ? query : query.where(eq(issueDrafts.status, status))

  return filtered.orderBy(desc(issueDrafts.createdAt)).all().map(mapIssueDraft)
}

export function listIssueDraftsForReview(
  db: PilogDatabase,
  filter: { status?: IssueDraftStatus | 'all' } = {}
): IssueDraftForReview[] {
  const drafts = listIssueDrafts(db, filter)
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

export function getIssueDraftById(db: PilogDatabase, id: string): IssueDraft | null {
  const row = db.select(issueDraftColumns).from(issueDrafts).where(eq(issueDrafts.id, id)).get()
  return row ? mapIssueDraft(row) : null
}

export function updateIssueDraft(
  db: PilogDatabase,
  input: { id: string; title: string; body: string; labels: string[] }
): IssueDraft | null {
  const previousUpdatedAt = getIssueDraftUpdatedAt(db, input.id)
  if (!previousUpdatedAt) return null

  const now = nextUpdatedAt(previousUpdatedAt)

  db.update(issueDrafts)
    .set({
      title: input.title,
      body: input.body,
      labels: JSON.stringify(input.labels),
      updatedAt: now
    })
    .where(eq(issueDrafts.id, input.id))
    .run()

  return getIssueDraftById(db, input.id)
}

export function updateIssueDraftStatus(
  db: PilogDatabase,
  input: { id: string; status: IssueDraftStatus }
): IssueDraft | null {
  const previousUpdatedAt = getIssueDraftUpdatedAt(db, input.id)
  if (!previousUpdatedAt) return null

  const now = nextUpdatedAt(previousUpdatedAt)

  db.update(issueDrafts)
    .set({
      status: input.status,
      updatedAt: now
    })
    .where(eq(issueDrafts.id, input.id))
    .run()

  return getIssueDraftById(db, input.id)
}

export function mergeIssueDrafts(
  db: PilogDatabase,
  input: { targetId: string; sourceId: string }
): IssueDraft | null {
  if (input.targetId === input.sourceId) throw new Error('Choose two different drafts to merge.')

  return db.transaction((tx) => {
    const rows = tx
      .select(issueDraftColumns)
      .from(issueDrafts)
      .where(inArray(issueDrafts.id, [input.targetId, input.sourceId]))
      .all()
    const draftsById = new Map(rows.map((row) => [row.id, mapIssueDraft(row)]))
    const target = draftsById.get(input.targetId)
    const source = draftsById.get(input.sourceId)

    if (!target || !source) return null
    if (target.repoId !== source.repoId) {
      throw new Error('Drafts from different repositories cannot be merged.')
    }
    if (target.status !== 'draft' || source.status !== 'draft') {
      throw new Error('Only active drafts can be merged.')
    }

    const now = nextUpdatedAt(
      [target.updatedAt, source.updatedAt].sort().at(-1) ?? target.updatedAt
    )

    tx.update(issueDrafts)
      .set({
        body: mergeDraftBodies(target, source),
        labels: JSON.stringify(mergeUnique(target.labels, source.labels)),
        sourceNoteIds: JSON.stringify(mergeUnique(target.sourceNoteIds, source.sourceNoteIds)),
        affectedFilesJson: JSON.stringify(
          mergeAffectedFiles(target.affectedFiles, source.affectedFiles)
        ),
        status: 'draft',
        updatedAt: now
      })
      .where(eq(issueDrafts.id, target.id))
      .run()

    tx.update(issueDrafts)
      .set({
        status: 'dismissed',
        updatedAt: now
      })
      .where(eq(issueDrafts.id, source.id))
      .run()

    const merged = tx
      .select(issueDraftColumns)
      .from(issueDrafts)
      .where(eq(issueDrafts.id, target.id))
      .get()

    return merged ? mapIssueDraft(merged) : null
  })
}

function getIssueDraftUpdatedAt(db: PilogDatabase, id: string): string | null {
  const row = db
    .select({ updatedAt: issueDrafts.updatedAt })
    .from(issueDrafts)
    .where(eq(issueDrafts.id, id))
    .get()

  return row?.updatedAt ?? null
}

export function markIssueDraftPublished(
  db: PilogDatabase,
  input: {
    id: string
    title: string
    body: string
    labels: string[]
    githubIssueUrl: string
  }
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
      status: 'published',
      githubIssueUrl: input.githubIssueUrl,
      updatedAt: now
    })
    .where(eq(issueDrafts.id, input.id))
    .run()

  return getIssueDraftById(db, input.id)
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

function mergeDraftBodies(target: IssueDraft, source: IssueDraft): string {
  return [target.body.trim(), `## Merged draft: ${source.title}`, source.body.trim()]
    .filter(Boolean)
    .join('\n\n')
}

function mergeUnique<T>(targetItems: T[], sourceItems: T[]): T[] {
  return [...new Set([...targetItems, ...sourceItems])]
}

function mergeAffectedFiles(
  targetFiles: IssueDraft['affectedFiles'],
  sourceFiles: IssueDraft['affectedFiles']
): IssueDraft['affectedFiles'] {
  const filesByPath = new Map<string, IssueDraft['affectedFiles'][number]>()

  for (const file of [...targetFiles, ...sourceFiles]) {
    const existing = filesByPath.get(file.path)
    if (!existing) {
      filesByPath.set(file.path, file)
      continue
    }

    if (file.reason && !existing.reason.includes(file.reason)) {
      filesByPath.set(file.path, {
        ...existing,
        reason: `${existing.reason}; ${file.reason}`
      })
    }
  }

  return [...filesByPath.values()]
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
