import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { createNote, listNotes } from './notes'

describe('notes repository', () => {
  let db: PilogDatabase

  beforeEach(() => {
    db = createInMemoryDatabase()
    runMigrations(db)
  })

  it('creates a note and returns it with all fields populated', () => {
    const note = createNote(db, { content: 'fix the spacing bug' })

    expect(note.id).toBeDefined()
    expect(note.content).toBe('fix the spacing bug')
    expect(note.status).toBe('unprocessed')
    expect(note.createdAt).toBeDefined()
    expect(note.updatedAt).toBeDefined()
  })

  it('lists notes ordered by createdAt descending', () => {
    const first = createNote(db, { content: 'first note' })
    const second = createNote(db, { content: 'second note' })

    const notes = listNotes(db)

    expect(notes).toHaveLength(2)
    expect(notes[0].id).toBe(second.id)
    expect(notes[1].id).toBe(first.id)
  })

  it('returns an empty array when no notes exist', () => {
    const notes = listNotes(db)
    expect(notes).toEqual([])
  })

  it('persists notes across reads', () => {
    createNote(db, { content: 'persistent note' })

    const notes = listNotes(db)
    expect(notes).toHaveLength(1)
    expect(notes[0].content).toBe('persistent note')
  })
})
