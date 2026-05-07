import { desc, sql } from 'drizzle-orm'
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
  const rows = db
    .select()
    .from(notes)
    .orderBy(desc(notes.createdAt), desc(sql`rowid`))
    .all()
  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }))
}
