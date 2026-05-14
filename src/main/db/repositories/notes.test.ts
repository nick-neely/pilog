import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { createNote, listNotes, updateNote, deleteNote, updateNoteStatus } from './notes'

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

  describe('listNotes with filters', () => {
    beforeEach(() => {
      const a = createNote(db, { content: 'fix the spacing bug in header' })
      const b = createNote(db, { content: 'add dark mode toggle' })
      createNote(db, { content: 'refactor spacing utilities' })

      updateNoteStatus(db, a.id, 'drafted')
      updateNoteStatus(db, b.id, 'published')
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

  describe('repoId support', () => {
    it('createNote stores Capture Context when provided', () => {
      const captureContext = {
        state: 'captured' as const,
        branch: 'main',
        dirtyFiles: ['src/app.ts'],
        stagedFiles: ['README.md'],
        headSha: '0123456789abcdef0123456789abcdef01234567',
        headSubject: 'Initial commit',
        capturedAt: '2026-05-14T21:00:00.000Z'
      }

      const note = createNote(db, { content: 'repo note', repoId: 'repo-123', captureContext })

      expect(note.captureContext).toEqual(captureContext)
      expect(listNotes(db)[0].captureContext).toEqual(captureContext)
    })

    it('createNote stores unavailable Capture Context without failing note persistence', () => {
      const captureContext = {
        state: 'unavailable' as const,
        capturedAt: '2026-05-14T21:00:00.000Z'
      }

      const note = createNote(db, { content: 'repo note', repoId: 'repo-123', captureContext })

      expect(note.content).toBe('repo note')
      expect(note.captureContext).toEqual(captureContext)
    })

    it('loads existing notes without Capture Context as null', () => {
      db.run(
        `INSERT INTO notes (id, content, status, repo_id, created_at, updated_at)
         VALUES ('legacy-note', 'old note', 'unprocessed', 'repo-123', '2026-05-14T20:00:00.000Z', '2026-05-14T20:00:00.000Z')`
      )

      expect(listNotes(db)[0].captureContext).toBeNull()
    })

    it('createNote stores repoId when provided', () => {
      const note = createNote(db, { content: 'repo note', repoId: 'repo-123' })
      expect(note.repoId).toBe('repo-123')
    })

    it('createNote stores null repoId when not provided', () => {
      const note = createNote(db, { content: 'no repo note' })
      expect(note.repoId).toBeNull()
    })

    it('createNote stores null repoId when explicitly null', () => {
      const note = createNote(db, { content: 'null repo', repoId: null })
      expect(note.repoId).toBeNull()
    })

    it('listNotes returns repoId on each note', () => {
      createNote(db, { content: 'with repo', repoId: 'repo-abc' })
      createNote(db, { content: 'without repo' })
      const result = listNotes(db)
      expect(result).toHaveLength(2)
      const withRepo = result.find((n) => n.content === 'with repo')
      const withoutRepo = result.find((n) => n.content === 'without repo')
      expect(withRepo?.repoId).toBe('repo-abc')
      expect(withoutRepo?.repoId).toBeNull()
    })

    it('listNotes filters by specific repoId', () => {
      createNote(db, { content: 'repo A note', repoId: 'repo-A' })
      createNote(db, { content: 'repo B note', repoId: 'repo-B' })
      createNote(db, { content: 'unassigned note' })

      const result = listNotes(db, { repoId: 'repo-A' })
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('repo A note')
    })

    it('listNotes with repoId: null returns only unassigned notes', () => {
      createNote(db, { content: 'has repo', repoId: 'repo-X' })
      createNote(db, { content: 'unassigned 1' })
      createNote(db, { content: 'unassigned 2' })

      const result = listNotes(db, { repoId: null })
      expect(result).toHaveLength(2)
      expect(result.every((n) => n.repoId === null)).toBe(true)
    })

    it('listNotes combines repoId filter with status filter', () => {
      const a = createNote(db, { content: 'A drafted repo-1', repoId: 'repo-1' })
      createNote(db, { content: 'B unprocessed repo-1', repoId: 'repo-1' })
      createNote(db, { content: 'C drafted repo-2', repoId: 'repo-2' })
      updateNoteStatus(db, a.id, 'drafted')

      const result = listNotes(db, { repoId: 'repo-1', status: 'drafted' })
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('A drafted repo-1')
    })

    it('updateNote can set a repoId', () => {
      const note = createNote(db, { content: 'to update' })
      expect(note.repoId).toBeNull()

      const updated = updateNote(db, { id: note.id, content: 'to update', repoId: 'repo-set' })
      expect(updated?.repoId).toBe('repo-set')
    })

    it('updateNote can clear a repoId to null', () => {
      const note = createNote(db, { content: 'clear repo', repoId: 'repo-old' })

      const updated = updateNote(db, { id: note.id, content: 'clear repo', repoId: null })
      expect(updated?.repoId).toBeNull()
    })

    it('updateNote without repoId does not change existing repoId', () => {
      const note = createNote(db, { content: 'keep repo', repoId: 'repo-keep' })

      const updated = updateNote(db, { id: note.id, content: 'keep repo updated' })
      expect(updated?.repoId).toBe('repo-keep')
    })
  })
})
