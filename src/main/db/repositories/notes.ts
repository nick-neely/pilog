import { desc, eq, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { notes } from '../schema'
import type { Note } from '@shared/ipc'

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

export function listNotes(db: PilogDatabase): Note[] {
  return db
    .select({
      id: notes.id,
      content: notes.content,
      status: notes.status,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt
    })
    .from(notes)
    .orderBy(desc(notes.createdAt), desc(sql`rowid`))
    .all()
}

export function updateNote(db: PilogDatabase, input: { id: string; content: string }): Note | null {
  const now = new Date().toISOString()

  const result = db
    .update(notes)
    .set({ content: input.content, updatedAt: now })
    .where(eq(notes.id, input.id))
    .run()

  if (result.changes === 0) return null

  const row = db
    .select({
      id: notes.id,
      content: notes.content,
      status: notes.status,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt
    })
    .from(notes)
    .where(eq(notes.id, input.id))
    .get()

  return row ?? null
}

export function deleteNote(db: PilogDatabase, input: { id: string }): boolean {
  const result = db.delete(notes).where(eq(notes.id, input.id)).run()
  return result.changes > 0
}
