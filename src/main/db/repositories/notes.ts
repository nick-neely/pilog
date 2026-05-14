import { and, desc, eq, isNull, like, sql, type SQLWrapper } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { notes } from '../schema'
import type {
  CountNotesRequest,
  ListNotesRequest,
  Note,
  NoteCaptureContext,
  NoteStatus,
  NoteStatusCounts
} from '@shared/ipc'

const noteColumns = {
  id: notes.id,
  content: notes.content,
  status: notes.status,
  repoId: notes.repoId,
  runId: notes.runId,
  captureContext: notes.captureContext,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt
} as const

export function createNote(
  db: PilogDatabase,
  input: { content: string; repoId?: string | null; captureContext?: NoteCaptureContext | null }
): Note {
  const now = new Date().toISOString()
  const id = uuidv4()
  const repoId = input.repoId ?? null
  const captureContext = input.captureContext ?? null

  db.insert(notes)
    .values({
      id,
      content: input.content,
      status: 'unprocessed',
      repoId,
      captureContext: captureContext ? JSON.stringify(captureContext) : null,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return {
    id,
    content: input.content,
    status: 'unprocessed',
    repoId,
    runId: null,
    captureContext,
    createdAt: now,
    updatedAt: now
  }
}

export function listNotes(db: PilogDatabase, filter?: ListNotesRequest): Note[] {
  const conditions: SQLWrapper[] = []

  if (filter?.status) {
    conditions.push(eq(notes.status, filter.status))
  }

  if (filter?.search) {
    conditions.push(like(notes.content, `%${filter.search}%`))
  }

  // repoId: null → only unassigned; repoId: string → specific repo; undefined → all
  if (filter !== undefined && 'repoId' in filter) {
    if (filter.repoId === null) {
      conditions.push(isNull(notes.repoId))
    } else if (filter.repoId !== undefined) {
      conditions.push(eq(notes.repoId, filter.repoId))
    }
  }

  const query = db.select(noteColumns).from(notes)
  const ordered = conditions.length > 0 ? query.where(and(...conditions)) : query

  return ordered
    .orderBy(desc(notes.createdAt), desc(sql`rowid`))
    .all()
    .map(mapNoteRow)
}

/**
 * Returns a count for every NoteStatus, even when zero. The sidebar's status
 * filter shows all four rows always; the response shape mirrors that so the
 * renderer never has to fill gaps. Honours search and repoId filters so the
 * counts answer "if I pick this status next, how many notes will I see?".
 */
export function countNotesByStatus(
  db: PilogDatabase,
  filter?: CountNotesRequest
): NoteStatusCounts {
  const conditions: SQLWrapper[] = []

  if (filter?.search) {
    conditions.push(like(notes.content, `%${filter.search}%`))
  }

  // Same repoId encoding as listNotes: null → unassigned only, undefined → all.
  if (filter !== undefined && 'repoId' in filter) {
    if (filter.repoId === null) {
      conditions.push(isNull(notes.repoId))
    } else if (filter.repoId !== undefined) {
      conditions.push(eq(notes.repoId, filter.repoId))
    }
  }

  const baseQuery = db.select({ status: notes.status, count: sql<number>`count(*)` }).from(notes)
  const grouped =
    conditions.length > 0
      ? baseQuery.where(and(...conditions)).groupBy(notes.status)
      : baseQuery.groupBy(notes.status)

  const counts: NoteStatusCounts = {
    unprocessed: 0,
    drafted: 0,
    published: 0,
    dismissed: 0
  }
  for (const row of grouped.all()) {
    counts[row.status as NoteStatus] = Number(row.count)
  }
  return counts
}

export function updateNoteStatus(db: PilogDatabase, id: string, status: NoteStatus): Note {
  const now = new Date().toISOString()

  const row = db
    .update(notes)
    .set({ status, updatedAt: now })
    .where(eq(notes.id, id))
    .returning(noteColumns)
    .get()

  if (!row) throw new Error(`Note not found: ${id}`)
  return mapNoteRow(row)
}

export function updateNote(
  db: PilogDatabase,
  input: { id: string; content: string; repoId?: string | null }
): Note | null {
  const now = new Date().toISOString()

  const patch: Partial<typeof notes.$inferInsert> = { content: input.content, updatedAt: now }

  // Only update repoId when caller explicitly passes it (undefined = leave unchanged)
  if ('repoId' in input) {
    patch.repoId = input.repoId ?? null
  }

  const row = db.update(notes).set(patch).where(eq(notes.id, input.id)).returning(noteColumns).get()

  return row ? mapNoteRow(row) : null
}

export function deleteNote(db: PilogDatabase, input: { id: string }): boolean {
  const result = db.delete(notes).where(eq(notes.id, input.id)).run()
  return result.changes > 0
}

type NoteRow = typeof notes.$inferSelect

export function mapNoteRow(row: Pick<NoteRow, keyof typeof noteColumns>): Note {
  return {
    ...row,
    captureContext: parseCaptureContext(row.captureContext)
  }
}

function parseCaptureContext(value: string | null): NoteCaptureContext | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecord(parsed)) return null
    const candidate = parsed
    if (candidate.state === 'unavailable' && typeof candidate.capturedAt === 'string') {
      return { state: 'unavailable', capturedAt: candidate.capturedAt }
    }
    if (
      candidate.state === 'captured' &&
      typeof candidate.capturedAt === 'string' &&
      Array.isArray(candidate.dirtyFiles) &&
      Array.isArray(candidate.stagedFiles)
    ) {
      return {
        state: 'captured',
        branch: typeof candidate.branch === 'string' ? candidate.branch : null,
        dirtyFiles: parseStringArray(candidate.dirtyFiles),
        stagedFiles: parseStringArray(candidate.stagedFiles),
        headSha: typeof candidate.headSha === 'string' ? candidate.headSha : null,
        headSubject: typeof candidate.headSubject === 'string' ? candidate.headSubject : null,
        capturedAt: candidate.capturedAt
      }
    }
  } catch {
    return null
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
