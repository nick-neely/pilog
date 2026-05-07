import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { createNote, listNotes, updateNote, deleteNote } from './notes'

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

  describe('updateNote', () => {
    it('updates the content and returns the updated note', () => {
      const note = createNote(db, { content: 'original' })
      const beforeUpdate = new Date().toISOString()

      const updated = updateNote(db, { id: note.id, content: 'edited' })

      expect(updated).not.toBeNull()
      expect(updated!.content).toBe('edited')
      expect(updated!.id).toBe(note.id)
      expect(updated!.status).toBe(note.status)
      expect(updated!.createdAt).toBe(note.createdAt)
      expect(updated!.updatedAt >= beforeUpdate).toBe(true)
    })

    it('persists the update across reads', () => {
      const note = createNote(db, { content: 'original' })
      updateNote(db, { id: note.id, content: 'edited' })

      const notes = listNotes(db)
      expect(notes).toHaveLength(1)
      expect(notes[0].content).toBe('edited')
    })

    it('returns null for a non-existent id', () => {
      const result = updateNote(db, { id: 'non-existent', content: 'nope' })
      expect(result).toBeNull()
    })
  })

  describe('deleteNote', () => {
    it('removes the note and returns true', () => {
      const note = createNote(db, { content: 'to delete' })

      const result = deleteNote(db, { id: note.id })

      expect(result).toBe(true)
      expect(listNotes(db)).toHaveLength(0)
    })

    it('returns false for a non-existent id', () => {
      const result = deleteNote(db, { id: 'non-existent' })
      expect(result).toBe(false)
    })

    it('only removes the targeted note', () => {
      const keep = createNote(db, { content: 'keep me' })
      const remove = createNote(db, { content: 'remove me' })

      deleteNote(db, { id: remove.id })

      const notes = listNotes(db)
      expect(notes).toHaveLength(1)
      expect(notes[0].id).toBe(keep.id)
    })
  })
})
