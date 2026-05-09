import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { createRepo } from './repos'
import {
  createIssueDraft,
  getIssueDraftById,
  listIssueDrafts,
  listIssueDraftsForReview,
  markIssueDraftPublished,
  mergeIssueDrafts,
  splitIssueDraft,
  updateIssueDraft,
  updateIssueDraftStatus
} from './issue-drafts'
import { createNote, listNotes, updateNoteStatus } from './notes'
import { listPublishLog } from './publish-log'
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

  it('splits selected source notes into a new editable draft', () => {
    const firstNote = createNote(db, { content: 'save button needs loading state', repoId })
    const secondNote = createNote(db, { content: 'avatar upload errors silently', repoId })
    const thirdNote = createNote(db, { content: 'mobile settings spacing is cramped', repoId })
    const draft = createIssueDraft(db, {
      repoId,
      draft: {
        ...generatedDraft,
        sourceNoteIds: [firstNote.id, secondNote.id, thirdNote.id],
        suggestedLabels: ['bug', 'settings'],
        affectedFiles: [
          { path: 'src/settings.tsx', reason: 'Settings surface' },
          { path: 'src/avatar.tsx', reason: 'Avatar upload surface' }
        ],
        confidence: 'high',
        groupingReason: 'Grouped broad settings UX notes'
      }
    })

    const split = splitIssueDraft(db, {
      id: draft.id,
      movedSourceNoteIds: [secondNote.id]
    })

    expect(split.original).toMatchObject({
      id: draft.id,
      status: 'draft',
      repoId,
      sourceNoteIds: [firstNote.id, thirdNote.id]
    })
    expect(split.newDraft).toMatchObject({
      repoId,
      title: `${draft.title} (split)`,
      body: draft.body,
      labels: ['bug', 'settings'],
      sourceNoteIds: [secondNote.id],
      affectedFiles: draft.affectedFiles,
      confidence: 'high',
      groupingReason: 'Split from draft: Grouped broad settings UX notes',
      status: 'draft',
      githubIssueUrl: null
    })
    expect(split.newDraft.id).not.toBe(draft.id)

    const reviewed = listIssueDraftsForReview(db, { status: 'draft' })
    expect(
      reviewed.find((item) => item.id === draft.id)?.sourceNotes.map((note) => note.id)
    ).toEqual([firstNote.id, thirdNote.id])
    expect(
      reviewed.find((item) => item.id === split.newDraft.id)?.sourceNotes.map((note) => note.id)
    ).toEqual([secondNote.id])
  })

  it('rejects a split that would leave either draft without source notes', () => {
    const firstNote = createNote(db, { content: 'save button needs loading state', repoId })
    const secondNote = createNote(db, { content: 'avatar upload errors silently', repoId })
    const draft = createIssueDraft(db, {
      repoId,
      draft: { ...generatedDraft, sourceNoteIds: [firstNote.id, secondNote.id] }
    })

    expect(() =>
      splitIssueDraft(db, {
        id: draft.id,
        movedSourceNoteIds: [firstNote.id, secondNote.id]
      })
    ).toThrow('Split must leave at least one source note on each draft')
    expect(getIssueDraftById(db, draft.id)?.sourceNoteIds).toEqual([firstNote.id, secondNote.id])
    expect(listIssueDrafts(db, { status: 'draft' })).toHaveLength(1)
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

  it('dismisses a draft and excludes it from the default active list', () => {
    const kept = createIssueDraft(db, { repoId, draft: generatedDraft })
    const dismissed = createIssueDraft(db, {
      repoId,
      draft: { ...generatedDraft, title: 'Dismiss duplicate loading note' }
    })

    const updated = updateIssueDraftStatus(db, { id: dismissed.id, status: 'dismissed' })

    expect(updated).toMatchObject({
      id: dismissed.id,
      status: 'dismissed',
      title: 'Dismiss duplicate loading note',
      githubIssueUrl: null
    })
    expect(updated?.updatedAt).not.toBe(dismissed.updatedAt)
    expect(listIssueDrafts(db).map((draft) => draft.id)).toEqual([kept.id])
    expect(listIssueDrafts(db, { status: 'dismissed' }).map((draft) => draft.id)).toEqual([
      dismissed.id
    ])
  })

  it('dismisses a draft without publishing or changing source note status', () => {
    const note = createNote(db, { content: 'save button needs loading state', repoId })
    updateNoteStatus(db, note.id, 'drafted')
    const draft = createIssueDraft(db, {
      repoId,
      draft: { ...generatedDraft, sourceNoteIds: [note.id] }
    })

    updateIssueDraftStatus(db, { id: draft.id, status: 'dismissed' })

    expect(listNotes(db, { repoId }).map((persisted) => persisted.status)).toEqual(['drafted'])
    expect(listPublishLog(db, { repoId })).toEqual([])
  })

  it('returns null when updating status for a missing draft', () => {
    expect(updateIssueDraftStatus(db, { id: 'missing', status: 'dismissed' })).toBeNull()
  })

  it('merges two same-repo drafts into one editable active draft', () => {
    const target = createIssueDraft(db, {
      repoId,
      draft: {
        ...generatedDraft,
        title: 'Add loading state',
        sourceNoteIds: ['note-1', 'note-2'],
        suggestedLabels: ['bug', 'settings'],
        affectedFiles: [{ path: 'src/save.ts', reason: 'Likely save flow' }]
      }
    })
    const source = createIssueDraft(db, {
      repoId,
      draft: {
        ...generatedDraft,
        title: 'Prevent double-submit',
        summary: 'Settings submit can double-fire.',
        context: 'A rough note mentioned the settings form.',
        sourceNoteIds: ['note-2', 'note-3'],
        suggestedLabels: ['settings', 'regression'],
        affectedFiles: [
          { path: 'src/save.ts', reason: 'Shared pending state' },
          { path: 'src/settings.tsx', reason: 'Settings submit handler' }
        ],
        acceptanceCriteria: ['Submit cannot fire twice']
      }
    })

    const merged = mergeIssueDrafts(db, { targetId: target.id, sourceId: source.id })

    expect(merged).toMatchObject({
      id: target.id,
      title: 'Add loading state',
      labels: ['bug', 'settings', 'regression'],
      sourceNoteIds: ['note-1', 'note-2', 'note-3'],
      affectedFiles: [
        { path: 'src/save.ts', reason: 'Likely save flow; Shared pending state' },
        { path: 'src/settings.tsx', reason: 'Settings submit handler' }
      ],
      status: 'draft',
      githubIssueUrl: null
    })
    expect(merged?.body).toContain('The save button needs a loading state.')
    expect(merged?.body).toContain('Settings submit can double-fire.')
    expect(merged?.body).toContain('Merged draft: Prevent double-submit')
    expect(getIssueDraftById(db, source.id)).toMatchObject({ status: 'dismissed' })
    expect(listIssueDrafts(db).map((draft) => draft.id)).toEqual([target.id])
  })

  it('blocks merging drafts across repositories', () => {
    const otherRepoId = createRepo(db, {
      name: 'other',
      owner: 'nick-neely',
      localPath: '/tmp/other',
      githubUrl: 'https://github.com/nick-neely/other',
      defaultBranch: 'main'
    }).id
    const target = createIssueDraft(db, { repoId, draft: generatedDraft })
    const source = createIssueDraft(db, { repoId: otherRepoId, draft: generatedDraft })

    expect(() => mergeIssueDrafts(db, { targetId: target.id, sourceId: source.id })).toThrow(
      'Drafts from different repositories cannot be merged.'
    )
    expect(getIssueDraftById(db, target.id)).toMatchObject({ status: 'draft' })
    expect(getIssueDraftById(db, source.id)).toMatchObject({ status: 'draft' })
  })

  it('marks a draft as published with the edited content and GitHub URL', () => {
    const draft = createIssueDraft(db, { repoId, draft: generatedDraft })

    const published = markIssueDraftPublished(db, {
      id: draft.id,
      title: 'Edited publish title',
      body: 'Edited markdown body',
      labels: ['bug', 'ready'],
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/21'
    })

    expect(published).toMatchObject({
      id: draft.id,
      title: 'Edited publish title',
      body: 'Edited markdown body',
      labels: ['bug', 'ready'],
      status: 'published',
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/21'
    })
    expect(getIssueDraftById(db, draft.id)).toMatchObject({
      status: 'published',
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/21'
    })
  })
})
