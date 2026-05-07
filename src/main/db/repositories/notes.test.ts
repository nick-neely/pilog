import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { createNote, listNotes, updateNoteStatus } from './notes'

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

  describe('listNotes with filters', () => {
    beforeEach(() => {
      const a = createNote(db, { content: 'fix the spacing bug in header' })
      const b = createNote(db, { content: 'add dark mode toggle' })
      createNote(db, { content: 'refactor spacing utilities' })

      updateNoteStatus(db, a.id, 'drafted')
      updateNoteStatus(db, b.id, 'published')
      // c stays unprocessed
    })

    it('filters by status', () => {
      const drafted = listNotes(db, { status: 'drafted' })
      expect(drafted).toHaveLength(1)
      expect(drafted[0].content).toBe('fix the spacing bug in header')
    })

    it('filters by search term (case-insensitive LIKE)', () => {
      const results = listNotes(db, { search: 'spacing' })
      expect(results).toHaveLength(2)
      expect(results.map((n) => n.content)).toContain('fix the spacing bug in header')
      expect(results.map((n) => n.content)).toContain('refactor spacing utilities')
    })

    it('combines status and search filters', () => {
      const results = listNotes(db, { status: 'unprocessed', search: 'spacing' })
      expect(results).toHaveLength(1)
      expect(results[0].content).toBe('refactor spacing utilities')
    })

    it('returns all notes when no filters provided', () => {
      const results = listNotes(db)
      expect(results).toHaveLength(3)
    })

    it('returns all notes when filters are empty object', () => {
      const results = listNotes(db, {})
      expect(results).toHaveLength(3)
    })

    it('returns empty when status matches nothing', () => {
      const results = listNotes(db, { status: 'dismissed' })
      expect(results).toEqual([])
    })

    it('returns empty when search matches nothing', () => {
      const results = listNotes(db, { search: 'nonexistent' })
      expect(results).toEqual([])
    })
  })

  describe('updateNoteStatus', () => {
    it('updates the status and returns the updated note', () => {
      const note = createNote(db, { content: 'test note' })
      const updated = updateNoteStatus(db, note.id, 'drafted')

      expect(updated.id).toBe(note.id)
      expect(updated.status).toBe('drafted')
      expect(updated.content).toBe('test note')
      expect(updated.updatedAt).toBeDefined()
    })

    it('throws for non-existent note', () => {
      expect(() => updateNoteStatus(db, 'nonexistent-id', 'drafted')).toThrow()
    })
  })
})
