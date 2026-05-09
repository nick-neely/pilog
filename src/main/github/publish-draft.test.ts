import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../db/client'
import { runMigrations } from '../db/migrations'
import { createIssueDraft, getIssueDraftById } from '../db/repositories/issue-drafts'
import { createNote, listNotes, updateNoteStatus } from '../db/repositories/notes'
import { listPublishLog } from '../db/repositories/publish-log'
import { createRepo } from '../db/repositories/repos'
import { publishReviewedDraft } from './publish-draft'
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

describe('publishReviewedDraft', () => {
  let db: PilogDatabase

  beforeEach(() => {
    db = createInMemoryDatabase()
    runMigrations(db)
  })

  it('creates a GitHub issue and records all local publish state', async () => {
    const repo = createRepo(db, {
      name: 'pilog',
      owner: 'nick-neely',
      localPath: '/tmp/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const firstNote = createNote(db, { content: 'save button spins', repoId: repo.id })
    const secondNote = createNote(db, { content: 'disable save while pending', repoId: repo.id })
    updateNoteStatus(db, firstNote.id, 'drafted')
    updateNoteStatus(db, secondNote.id, 'drafted')

    const draft = createIssueDraft(db, {
      repoId: repo.id,
      draft: { ...generatedDraft, sourceNoteIds: [firstNote.id, secondNote.id] }
    })
    const createIssue = vi.fn().mockResolvedValue({
      url: 'https://github.com/nick-neely/pilog/issues/21',
      number: 21
    })

    const published = await publishReviewedDraft(
      db,
      {
        id: draft.id,
        title: 'Edited title',
        body: 'Edited markdown body',
        labels: ['bug', 'ready-for-agent']
      },
      createIssue
    )

    expect(createIssue).toHaveBeenCalledWith('nick-neely', 'pilog', {
      title: 'Edited title',
      body: 'Edited markdown body',
      labels: ['bug', 'ready-for-agent']
    })
    expect(published).toMatchObject({
      id: draft.id,
      title: 'Edited title',
      body: 'Edited markdown body',
      labels: ['bug', 'ready-for-agent'],
      status: 'published',
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/21'
    })
    expect(listPublishLog(db, { repoId: repo.id })).toEqual([
      expect.objectContaining({
        draftId: draft.id,
        repoId: repo.id,
        githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/21'
      })
    ])
    expect(listNotes(db).map((note) => [note.id, note.status])).toEqual(
      expect.arrayContaining([
        [firstNote.id, 'published'],
        [secondNote.id, 'published']
      ])
    )
  })

  it('leaves local state untouched when GitHub issue creation fails', async () => {
    const repo = createRepo(db, {
      name: 'pilog',
      owner: 'nick-neely',
      localPath: '/tmp/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'save button spins', repoId: repo.id })
    updateNoteStatus(db, note.id, 'drafted')
    const draft = createIssueDraft(db, {
      repoId: repo.id,
      draft: { ...generatedDraft, sourceNoteIds: [note.id] }
    })
    const createIssue = vi.fn().mockRejectedValue(new Error('GitHub rejected the issue'))

    await expect(
      publishReviewedDraft(
        db,
        {
          id: draft.id,
          title: 'Edited title',
          body: 'Edited markdown body',
          labels: ['bug']
        },
        createIssue
      )
    ).rejects.toThrow('GitHub rejected the issue')

    expect(getIssueDraftById(db, draft.id)).toMatchObject({
      title: draft.title,
      body: draft.body,
      labels: draft.labels,
      status: 'draft',
      githubIssueUrl: null
    })
    expect(listPublishLog(db, { repoId: repo.id })).toEqual([])
    expect(listNotes(db).find((item) => item.id === note.id)?.status).toBe('drafted')
  })
})
