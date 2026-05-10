import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../db/client'
import { runMigrations } from '../db/migrations'
import { createIssueDraft, getIssueDraftById } from '../db/repositories/issue-drafts'
import { createAgentRun, finalizeAgentRun } from '../db/repositories/agent-runs'
import { createNote, listNotes, updateNoteStatus } from '../db/repositories/notes'
import { listPublishLog } from '../db/repositories/publish-log'
import { createRepo } from '../db/repositories/repos'
import { publishAutoPublishRun, publishReviewedDraft } from './publish-draft'
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

  it('normalizes reviewed labels and omits unmatched labels unless explicitly kept', async () => {
    const repo = createRepo(db, {
      name: 'pilog',
      owner: 'nick-neely',
      localPath: '/tmp/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const draft = createIssueDraft(db, {
      repoId: repo.id,
      draft: { ...generatedDraft, suggestedLabels: ['Bug', 'paper-cut'] }
    })
    const createIssue = vi.fn().mockResolvedValue({
      url: 'https://github.com/nick-neely/pilog/issues/22',
      number: 22
    })
    const listLabels = vi.fn().mockResolvedValue([{ name: 'bug' }, { name: 'ready-for-agent' }])

    const published = await publishReviewedDraft(
      db,
      {
        id: draft.id,
        title: 'Edited title',
        body: 'Edited markdown body',
        labels: ['Bug', 'Ready For Agent', 'paper-cut'],
        keptUnmatchedLabels: ['paper-cut']
      },
      { createIssue, listLabels }
    )

    expect(listLabels).toHaveBeenCalledWith('nick-neely', 'pilog')
    expect(createIssue).toHaveBeenCalledWith('nick-neely', 'pilog', {
      title: 'Edited title',
      body: 'Edited markdown body',
      labels: ['bug', 'ready-for-agent', 'paper-cut']
    })
    expect(published.labels).toEqual(['bug', 'ready-for-agent', 'paper-cut'])
  })

  it('drops unmatched generated labels from review publish by default', async () => {
    const repo = createRepo(db, {
      name: 'pilog',
      owner: 'nick-neely',
      localPath: '/tmp/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const draft = createIssueDraft(db, {
      repoId: repo.id,
      draft: { ...generatedDraft, suggestedLabels: ['Bug', 'paper-cut'] }
    })
    const createIssue = vi.fn().mockResolvedValue({
      url: 'https://github.com/nick-neely/pilog/issues/23',
      number: 23
    })

    await publishReviewedDraft(
      db,
      {
        id: draft.id,
        title: 'Edited title',
        body: 'Edited markdown body',
        labels: ['Bug', 'paper-cut']
      },
      {
        createIssue,
        listLabels: vi.fn().mockResolvedValue([{ name: 'bug' }])
      }
    )

    expect(createIssue).toHaveBeenCalledWith('nick-neely', 'pilog', {
      title: 'Edited title',
      body: 'Edited markdown body',
      labels: ['bug']
    })
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

describe('publishAutoPublishRun', () => {
  let db: PilogDatabase

  beforeEach(() => {
    db = createInMemoryDatabase()
    runMigrations(db)
  })

  it('publishes every draft from a confirmed run and records a success report', async () => {
    const repo = createRepo(db, {
      name: 'pilog',
      owner: 'nick-neely',
      localPath: '/tmp/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const firstNote = createNote(db, { content: 'save button spins', repoId: repo.id })
    const secondNote = createNote(db, { content: 'settings spacing breaks', repoId: repo.id })
    updateNoteStatus(db, firstNote.id, 'drafted')
    updateNoteStatus(db, secondNote.id, 'drafted')
    const firstDraft = createIssueDraft(db, {
      repoId: repo.id,
      draft: { ...generatedDraft, sourceNoteIds: [firstNote.id], suggestedLabels: ['bug'] }
    })
    const secondDraft = createIssueDraft(db, {
      repoId: repo.id,
      draft: {
        ...generatedDraft,
        title: 'Fix settings spacing',
        sourceNoteIds: [secondNote.id],
        suggestedLabels: ['ready-for-agent']
      }
    })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [firstNote.id, secondNote.id] })
    finalizeAgentRun(db, {
      id: run.id,
      status: 'succeeded',
      outputDraftIds: [firstDraft.id, secondDraft.id],
      eventStream: []
    })
    const createIssue = vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://github.com/nick-neely/pilog/issues/41',
        number: 41
      })
      .mockResolvedValueOnce({
        url: 'https://github.com/nick-neely/pilog/issues/42',
        number: 42
      })

    const report = await publishAutoPublishRun(db, { runId: run.id }, createIssue)

    expect(report).toMatchObject({
      runId: run.id,
      repoId: repo.id,
      successCount: 2,
      failureCount: 0,
      failures: []
    })
    expect(report.successes).toEqual([
      expect.objectContaining({
        draftId: firstDraft.id,
        title: firstDraft.title,
        githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/41',
        sourceNoteIds: [firstNote.id]
      }),
      expect.objectContaining({
        draftId: secondDraft.id,
        title: secondDraft.title,
        githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/42',
        sourceNoteIds: [secondNote.id]
      })
    ])
    expect(listPublishLog(db, { repoId: repo.id })).toHaveLength(2)
    expect(listNotes(db).map((note) => [note.id, note.status])).toEqual(
      expect.arrayContaining([
        [firstNote.id, 'published'],
        [secondNote.id, 'published']
      ])
    )
  })

  it('normalizes auto-publish labels and omits unmatched labels', async () => {
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
      draft: {
        ...generatedDraft,
        sourceNoteIds: [note.id],
        suggestedLabels: ['Bug', 'paper-cut', 'ready for agent']
      }
    })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })
    finalizeAgentRun(db, {
      id: run.id,
      status: 'succeeded',
      outputDraftIds: [draft.id],
      eventStream: []
    })
    const createIssue = vi.fn().mockResolvedValue({
      url: 'https://github.com/nick-neely/pilog/issues/43',
      number: 43
    })

    const report = await publishAutoPublishRun(
      db,
      { runId: run.id },
      {
        createIssue,
        listLabels: vi.fn().mockResolvedValue([{ name: 'bug' }, { name: 'ready-for-agent' }])
      }
    )

    expect(report.successCount).toBe(1)
    expect(createIssue).toHaveBeenCalledWith('nick-neely', 'pilog', {
      title: draft.title,
      body: draft.body,
      labels: ['bug', 'ready-for-agent']
    })
  })

  it('reports a GitHub 422 without rolling back earlier successful publishes', async () => {
    const repo = createRepo(db, {
      name: 'pilog',
      owner: 'nick-neely',
      localPath: '/tmp/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const firstNote = createNote(db, { content: 'save button spins', repoId: repo.id })
    const secondNote = createNote(db, { content: 'settings spacing breaks', repoId: repo.id })
    updateNoteStatus(db, firstNote.id, 'drafted')
    updateNoteStatus(db, secondNote.id, 'drafted')
    const firstDraft = createIssueDraft(db, {
      repoId: repo.id,
      draft: { ...generatedDraft, sourceNoteIds: [firstNote.id] }
    })
    const secondDraft = createIssueDraft(db, {
      repoId: repo.id,
      draft: {
        ...generatedDraft,
        title: 'Fix settings spacing',
        sourceNoteIds: [secondNote.id]
      }
    })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [firstNote.id, secondNote.id] })
    finalizeAgentRun(db, {
      id: run.id,
      status: 'succeeded',
      outputDraftIds: [firstDraft.id, secondDraft.id],
      eventStream: []
    })
    const github422 = Object.assign(new Error('Validation Failed'), { status: 422 })
    const createIssue = vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://github.com/nick-neely/pilog/issues/41',
        number: 41
      })
      .mockRejectedValueOnce(github422)

    const report = await publishAutoPublishRun(db, { runId: run.id }, createIssue)

    expect(report).toMatchObject({
      successCount: 1,
      failureCount: 1
    })
    expect(report.successes).toEqual([
      expect.objectContaining({
        draftId: firstDraft.id,
        githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/41'
      })
    ])
    expect(report.failures).toEqual([
      expect.objectContaining({
        draftId: secondDraft.id,
        title: secondDraft.title,
        sourceNoteIds: [secondNote.id],
        error: 'GitHub 422: Validation Failed'
      })
    ])
    expect(getIssueDraftById(db, firstDraft.id)).toMatchObject({
      status: 'published',
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/41'
    })
    expect(getIssueDraftById(db, secondDraft.id)).toMatchObject({
      status: 'draft',
      githubIssueUrl: null
    })
    expect(listPublishLog(db, { repoId: repo.id })).toHaveLength(1)
    expect(listNotes(db).map((note) => [note.id, note.status])).toEqual(
      expect.arrayContaining([
        [firstNote.id, 'published'],
        [secondNote.id, 'drafted']
      ])
    )
  })
})
