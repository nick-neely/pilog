import { and, desc, eq, isNull, like, sql, type SQLWrapper } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { notes } from '../schema'
import type { ListNotesRequest, Note, NoteStatus } from '@shared/ipc'

const noteColumns = {
  id: notes.id,
  content: notes.content,
  status: notes.status,
  repoId: notes.repoId,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt
} as const

export function createNote(
  db: PilogDatabase,
  input: { content: string; repoId?: string | null }
): Note {
  const now = new Date().toISOString()
  const id = uuidv4()
  const repoId = input.repoId ?? null

  db.insert(notes)
    .values({
      id,
      content: input.content,
      status: 'unprocessed',
      repoId,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return { id, content: input.content, status: 'unprocessed', repoId, createdAt: now, updatedAt: now }
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

  return ordered.orderBy(desc(notes.createdAt), desc(sql`rowid`)).all()
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
  return row
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

  const row = db
    .update(notes)
    .set(patch)
    .where(eq(notes.id, input.id))
    .returning(noteColumns)
    .get()

  return row ?? null
}

export function deleteNote(db: PilogDatabase, input: { id: string }): boolean {
  const result = db.delete(notes).where(eq(notes.id, input.id)).run()
  return result.changes > 0
}
