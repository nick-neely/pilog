import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { createRepo } from './repos'
import {
  createIssueDraft,
  listIssueDrafts,
  listIssueDraftsForReview,
  updateIssueDraft
} from './issue-drafts'
import { createNote, updateNoteStatus } from './notes'
import type { GeneratedIssueDraft } from '@shared/types'

const generatedDraft: GeneratedIssueDraft = {
  title: 'Add loading state',
  summary: 'The save button needs a loading state.',
  context: 'A rough note mentioned the save flow.',
  sourceNoteIds: ['note-1'],
  suggestedLabels: ['bug'],
  affectedFiles: [{ path: 'src/save.ts', reason: 'Likely save flow' }],
  acceptanceCriteria: ['Save shows progress while pending'],
  implementationNotes: ['Keep the button disabled while pending'],
  confidence: 'medium',
  groupingReason: 'Single save-flow note',
  publishReady: true
}

describe('issue-drafts repository', () => {
  let db: PilogDatabase
  let repoId: string

  beforeEach(() => {
    db = createInMemoryDatabase()
    runMigrations(db)
    repoId = createRepo(db, {
      name: 'pilog',
      owner: 'nick-neely',
      localPath: '/tmp/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    }).id
  })

  it('lists drafts with parsed JSON fields', () => {
    const first = createIssueDraft(db, { repoId, draft: generatedDraft })
    const second = createIssueDraft(db, {
      repoId,
      draft: { ...generatedDraft, title: 'Handle avatar errors', suggestedLabels: ['ux'] }
    })

    expect(listIssueDrafts(db)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: first.id,
          labels: ['bug'],
          affectedFiles: [{ path: 'src/save.ts', reason: 'Likely save flow' }]
        }),
        expect.objectContaining({
          id: second.id,
          title: 'Handle avatar errors',
          labels: ['ux']
        })
      ])
    )
  })

  it('loads source note data for persisted drafts in source-note order', () => {
    const firstNote = createNote(db, { content: 'save button needs loading copy', repoId })
    const secondNote = createNote(db, { content: 'settings submit can double-fire', repoId })
    updateNoteStatus(db, firstNote.id, 'drafted')
    updateNoteStatus(db, secondNote.id, 'drafted')
    const draft = createIssueDraft(db, {
      repoId,
      draft: {
        ...generatedDraft,
        sourceNoteIds: [secondNote.id, firstNote.id, 'deleted-note']
      }
    })

    expect(listIssueDraftsForReview(db)[0]).toMatchObject({
      id: draft.id,
      sourceNoteIds: [secondNote.id, firstNote.id, 'deleted-note'],
      sourceNotes: [
        {
          id: secondNote.id,
          content: 'settings submit can double-fire',
          status: 'drafted',
          repoId
        },
        {
          id: firstNote.id,
          content: 'save button needs loading copy',
          status: 'drafted',
          repoId
        }
      ]
    })
  })

  it('updates mutable draft fields and persists them for later listing', () => {
    const draft = createIssueDraft(db, { repoId, draft: generatedDraft })

    const updated = updateIssueDraft(db, {
      id: draft.id,
      title: 'Add pending copy to save',
      body: '## Summary\nUpdated body.\n\n## Acceptance Criteria\n- Shows pending copy',
      labels: ['bug', 'settings']
    })

    expect(updated).toMatchObject({
      id: draft.id,
      title: 'Add pending copy to save',
      body: '## Summary\nUpdated body.\n\n## Acceptance Criteria\n- Shows pending copy',
      labels: ['bug', 'settings'],
      status: 'draft',
      githubIssueUrl: null
    })
    expect(updated?.updatedAt).not.toBe(draft.updatedAt)
    expect(listIssueDrafts(db)[0]).toMatchObject({
      id: draft.id,
      title: 'Add pending copy to save',
      labels: ['bug', 'settings']
    })
  })

  it('returns null when updating a missing draft', () => {
    expect(
      updateIssueDraft(db, {
        id: 'missing',
        title: 'No draft',
        body: 'No body',
        labels: []
      })
    ).toBeNull()
  })
})
