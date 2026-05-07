import { and, desc, eq, like, sql, type SQLWrapper } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { notes } from '../schema'
import type { ListNotesRequest, Note, NoteStatus } from '@shared/ipc'

const noteColumns = {
  id: notes.id,
  content: notes.content,
  status: notes.status,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt
} as const

export function createNote(db: PilogDatabase, input: { content: string }): Note {
  const now = new Date().toISOString()
  const id = uuidv4()

  db.insert(notes)
    .values({
      id,
      content: input.content,
      status: 'unprocessed',
      createdAt: now,
      updatedAt: now
    })
    .run()

  return { id, content: input.content, status: 'unprocessed', createdAt: now, updatedAt: now }
}

export function listNotes(db: PilogDatabase, filter?: ListNotesRequest): Note[] {
  const conditions: SQLWrapper[] = []

  if (filter?.status) {
    conditions.push(eq(notes.status, filter.status))
  }

  if (filter?.search) {
    conditions.push(like(notes.content, `%${filter.search}%`))
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

export function updateNote(db: PilogDatabase, input: { id: string; content: string }): Note | null {
  const now = new Date().toISOString()

  const row = db
    .update(notes)
    .set({ content: input.content, updatedAt: now })
    .where(eq(notes.id, input.id))
    .returning({
      id: notes.id,
      content: notes.content,
      status: notes.status,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt
    })
    .get()

  return row ?? null
}

export function deleteNote(db: PilogDatabase, input: { id: string }): boolean {
  const result = db.delete(notes).where(eq(notes.id, input.id)).run()
  return result.changes > 0
}
