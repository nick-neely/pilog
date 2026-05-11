import { GeneratedIssueDraftsSchema, type GeneratedIssueDraft } from '@shared/types'
import { eq } from 'drizzle-orm'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  clarificationResponse,
  singleDraftResponse,
  threeDraftResponse
} from '../../../fixtures/agent/fixture-responses'
import { createInMemoryDatabase } from '../db/client'
import { runMigrations } from '../db/migrations'
import { createAgentRun } from '../db/repositories/agent-runs'
import { createNote, listNotes, updateNoteStatus } from '../db/repositories/notes'
import { listPublishLog } from '../db/repositories/publish-log'
import { createRepo } from '../db/repositories/repos'
import { agentRuns, issueDrafts } from '../db/schema'
import { publishAutoPublishRun } from '../github/publish-draft'
import {
  planAutoPublishPreviewDrafts,
  buildIssueGenerationPrompt,
  createSubmitIssueDraftsTool,
  hydrateRepoLabelsIfNeeded,
  getCurrentInboxNotesForGeneration,
  persistGeneratedIssueDrafts,
  validateAndCollectSourceNoteIds
} from './issue-generation'

const draft: GeneratedIssueDraft = {
  title: 'Fix mobile settings spacing',
  summary: 'Settings spacing is cramped on mobile.',
  context: 'The source note reports odd settings page spacing on mobile.',
  sourceNoteIds: ['note-1', 'note-2'],
  suggestedLabels: ['ux'],
  affectedFiles: [{ path: 'src/settings.tsx', reason: 'Settings page surface.' }],
  acceptanceCriteria: ['Settings spacing is readable on narrow screens.'],
  implementationNotes: ['Check the settings layout at mobile widths.'],
  confidence: 'medium',
  groupingReason: 'Both notes describe settings mobile layout.',
  publishReady: true
}

describe('issue generation', () => {
  it('assembles the PRD-guided prompt with repo path and selected notes', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: {
        id: 'repo-1',
        owner: 'nick-neely',
        name: 'pilog',
        localPath: '/workspace/pilog',
        githubUrl: 'https://github.com/nick-neely/pilog',
        defaultBranch: 'main',
        autoPublishEnabled: false,
        autoPublishMaxIssuesPerRun: 5,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: false,
        autoPublishRequireConfirmation: true,
        githubLabels: [
          { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' },
          { id: 2, name: 'ready-for-agent', color: '0e8a16', description: null }
        ],
        githubLabelsSyncedAt: '2026-05-11T00:00:00.000Z',
        createdAt: '2026-05-08T00:00:00.000Z',
        updatedAt: '2026-05-08T00:00:00.000Z'
      },
      notes: [
        {
          id: 'note-1',
          content: 'settings page spacing is weird on mobile',
          status: 'unprocessed',
          repoId: 'repo-1',
          runId: null,
          createdAt: '2026-05-08T00:00:00.000Z',
          updatedAt: '2026-05-08T00:00:00.000Z'
        }
      ]
    })

    expect(prompt).toMatchSnapshot()
    expect(prompt).toContain('Do not create one issue per note by default.')
    expect(prompt).toContain('Group related minor UX notes.')
    expect(prompt).toContain('Split unrelated or complex notes.')
    expect(prompt).toContain('parent issue with checklist subtasks')
    expect(prompt).toContain('Return structured JSON only')
    expect(prompt).toContain('Mark vague notes as needing clarification.')
    expect(prompt).toContain('Prefer exact label names from the cached GitHub label vocabulary')
    expect(prompt).toContain('- bug: Something is broken')
    expect(prompt).toContain('- ready-for-agent')
  })

  it('lazily hydrates empty migrated repo label caches before generation', async () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const listLabels = vi
      .fn()
      .mockResolvedValue([
        { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' }
      ])

    const hydrated = await hydrateRepoLabelsIfNeeded(db, repo, listLabels)

    expect(listLabels).toHaveBeenCalledWith('nick-neely', 'pilog')
    expect(hydrated.githubLabels).toEqual([
      { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' }
    ])
    expect(hydrated.githubLabelsSyncedAt).toBeDefined()

    const persisted = await hydrateRepoLabelsIfNeeded(db, hydrated, listLabels)
    expect(persisted.githubLabels).toEqual(hydrated.githubLabels)
    expect(listLabels).toHaveBeenCalledTimes(1)
  })

  it('persists final drafts and finalizes the run in one transaction', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note1 = createNote(db, { content: 'settings page spacing is weird', repoId: repo.id })
    const note2 = createNote(db, {
      content: 'mobile settings controls wrap badly',
      repoId: repo.id
    })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note1.id, note2.id] })

    const draftIds = persistGeneratedIssueDrafts(db, {
      runId: run.id,
      repoId: repo.id,
      selectedNoteIds: [note1.id, note2.id],
      drafts: [{ ...draft, sourceNoteIds: [note1.id, note2.id] }],
      eventStream: [{ type: 'final' }]
    })

    const persistedDraft = db.select().from(issueDrafts).get()
    const finalizedRun = db.select().from(agentRuns).where(eq(agentRuns.id, run.id)).get()

    expect(draftIds).toHaveLength(1)
    expect(persistedDraft?.groupingReason).toBe('Both notes describe settings mobile layout.')
    expect(persistedDraft?.status).toBe('draft')
    expect(listNotes(db).map((note) => note.status)).toEqual(['drafted', 'drafted'])
    expect(finalizedRun?.status).toBe('succeeded')
    expect(JSON.parse(finalizedRun?.outputDraftIds ?? '[]')).toEqual(draftIds)
    expect(JSON.parse(finalizedRun?.eventStream ?? '[]')).toEqual([{ type: 'final' }])
  })

  it('scaffolds persisted generated draft bodies from the linked repo issue template', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repoPath = mkdtempSync(path.join(tmpdir(), 'pilog-generation-template-'))
    mkdirSync(path.join(repoPath, '.github', 'ISSUE_TEMPLATE'), { recursive: true })
    writeFileSync(
      path.join(repoPath, '.github', 'ISSUE_TEMPLATE', 'bug.md'),
      ['---', 'name: Bug report', '---', '', '## Summary', '', '## Acceptance Criteria'].join('\n')
    )
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: repoPath,
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'save button spins', repoId: repo.id })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })

    persistGeneratedIssueDrafts(db, {
      runId: run.id,
      repoId: repo.id,
      selectedNoteIds: [note.id],
      drafts: [{ ...draft, sourceNoteIds: [note.id] }],
      eventStream: [{ type: 'final' }]
    })

    const persistedDraft = db.select().from(issueDrafts).get()

    expect(persistedDraft?.body).toContain('## Summary\nSettings spacing is cramped on mobile.')
    expect(persistedDraft?.body).toContain(
      '## Acceptance Criteria\n- Settings spacing is readable on narrow screens.'
    )
    expect(persistedDraft?.body).toContain('## Pilog Review Notes')
    expect(persistedDraft?.affectedFilesJson).toBe(
      JSON.stringify([{ path: 'src/settings.tsx', reason: 'Settings page surface.' }])
    )
    expect(persistedDraft?.confidence).toBe('medium')
    expect(persistedDraft?.groupingReason).toBe('Both notes describe settings mobile layout.')
  })

  it('persists multiple drafts and records every output id', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const noteIds = [
      'note-settings-spacing',
      'note-settings-loading',
      'note-avatar-error',
      'note-auth-session',
      'note-vague'
    ].map((id) => createNote(db, { content: id, repoId: repo.id }).id)
    const draftSourceIds = new Map(
      [
        'note-settings-spacing',
        'note-settings-loading',
        'note-avatar-error',
        'note-auth-session',
        'note-vague'
      ].map((fixtureId, index) => [fixtureId, noteIds[index]!])
    )
    const drafts = threeDraftResponse.map((fixtureDraft) => ({
      ...fixtureDraft,
      sourceNoteIds: fixtureDraft.sourceNoteIds.map((id) => draftSourceIds.get(id)!)
    }))
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: noteIds })

    const draftIds = persistGeneratedIssueDrafts(db, {
      runId: run.id,
      repoId: repo.id,
      selectedNoteIds: noteIds,
      drafts,
      eventStream: [{ type: 'final' }]
    })

    const persistedDrafts = db.select().from(issueDrafts).all()
    const finalizedRun = db.select().from(agentRuns).where(eq(agentRuns.id, run.id)).get()

    expect(draftIds).toHaveLength(3)
    expect(persistedDrafts).toHaveLength(3)
    expect(JSON.parse(finalizedRun?.outputDraftIds ?? '[]')).toEqual(draftIds)
    expect(listNotes(db).map((note) => note.status)).toEqual([
      'drafted',
      'drafted',
      'drafted',
      'drafted',
      'drafted'
    ])
  })

  it('plans auto-publish preview drafts with guardrails before any publish writes', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const noteIds = ['settings spacing', 'avatar error', 'auth redirect'].map(
      (content) => createNote(db, { content, repoId: repo.id }).id
    )
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: noteIds })
    const generatedDrafts = [
      {
        ...draft,
        title: 'Fix settings spacing',
        sourceNoteIds: [noteIds[0]!],
        suggestedLabels: ['bug', 'triaged-by-pilog']
      },
      {
        ...draft,
        title: 'Handle avatar errors',
        sourceNoteIds: [noteIds[1]!],
        suggestedLabels: ['ux']
      },
      {
        ...draft,
        title: 'Repair auth redirect',
        sourceNoteIds: [noteIds[2]!],
        suggestedLabels: []
      }
    ]

    const plan = planAutoPublishPreviewDrafts({
      runId: run.id,
      repo: {
        ...repo,
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 2,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: true
      },
      drafts: generatedDrafts
    })
    const draftIds = persistGeneratedIssueDrafts(db, {
      runId: run.id,
      repoId: repo.id,
      selectedNoteIds: noteIds,
      drafts: plan.drafts,
      eventStream: [{ type: 'final', drafts: plan.drafts, autoPublishPreview: plan.summary }]
    })

    const persistedDrafts = db.select().from(issueDrafts).all()

    expect(plan.summary).toMatchObject({
      generatedDraftCount: 3,
      plannedDraftCount: 2,
      maxIssuesPerRun: 2,
      defaultLabel: 'triaged-by-pilog',
      dryRun: true,
      limited: true
    })
    expect(plan.summary.message).toContain('1 draft is held back')
    expect(draftIds).toHaveLength(2)
    expect(persistedDrafts.map((persisted) => JSON.parse(persisted.labels))).toEqual([
      ['bug', 'triaged-by-pilog'],
      ['ux', 'triaged-by-pilog']
    ])
    expect(listPublishLog(db, { repoId: repo.id })).toEqual([])
  })

  it('normalizes auto-publish preview labels against repo labels', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'settings label variants', repoId: repo.id })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })

    const plan = planAutoPublishPreviewDrafts({
      runId: run.id,
      repo: {
        ...repo,
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 5,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: true
      },
      repoLabels: [{ name: 'ready-for-agent' }, { name: 'triaged-by-pilog' }],
      drafts: [
        {
          ...draft,
          sourceNoteIds: [note.id],
          suggestedLabels: ['Ready For Agent', 'paper-cut']
        }
      ]
    })

    expect(plan.drafts[0]?.suggestedLabels).toEqual([
      'ready-for-agent',
      'paper-cut',
      'triaged-by-pilog'
    ])
    expect(plan.drafts[0]?.labelMatches).toEqual([
      { input: 'Ready For Agent', name: 'ready-for-agent', matched: true },
      { input: 'paper-cut', name: 'paper-cut', matched: false },
      { input: 'triaged-by-pilog', name: 'triaged-by-pilog', matched: true }
    ])
  })

  it('selects only eligible current-inbox notes for one repo', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const otherRepo = createRepo(db, {
      owner: 'nick-neely',
      name: 'other',
      localPath: '/workspace/other',
      githubUrl: 'https://github.com/nick-neely/other',
      defaultBranch: 'main'
    })
    const eligible = createNote(db, { content: 'process this note', repoId: repo.id })
    const drafted = createNote(db, { content: 'already drafted', repoId: repo.id })
    const published = createNote(db, { content: 'already published', repoId: repo.id })
    const dismissed = createNote(db, { content: 'dismissed', repoId: repo.id })
    createNote(db, { content: 'unlinked' })
    createNote(db, { content: 'other repo', repoId: otherRepo.id })
    updateNoteStatus(db, drafted.id, 'drafted')
    updateNoteStatus(db, published.id, 'published')
    updateNoteStatus(db, dismissed.id, 'dismissed')

    const result = getCurrentInboxNotesForGeneration(db, repo.id)

    expect(result.repo.id).toBe(repo.id)
    expect(result.notes.map((note) => note.id)).toEqual([eligible.id])
  })

  it('returns no eligible current-inbox notes without creating a run', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const drafted = createNote(db, { content: 'already drafted', repoId: repo.id })
    createNote(db, { content: 'unlinked' })
    updateNoteStatus(db, drafted.id, 'drafted')

    const result = getCurrentInboxNotesForGeneration(db, repo.id)

    expect(result.notes).toEqual([])
    expect(db.select().from(agentRuns).all()).toEqual([])
  })

  it('lets a current-inbox preview run reuse the confirmed publish flow', async () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const first = createNote(db, { content: 'save button needs loading', repoId: repo.id })
    const second = createNote(db, { content: 'settings spacing breaks', repoId: repo.id })
    const { notes } = getCurrentInboxNotesForGeneration(db, repo.id)
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: notes.map((note) => note.id) })
    const plan = planAutoPublishPreviewDrafts({
      runId: run.id,
      repo: {
        ...repo,
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 5,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: false,
        autoPublishRequireConfirmation: true
      },
      drafts: [
        {
          ...draft,
          title: 'Add loading state to save button',
          sourceNoteIds: [first.id],
          suggestedLabels: []
        },
        {
          ...draft,
          title: 'Fix settings spacing',
          sourceNoteIds: [second.id],
          suggestedLabels: ['ux']
        }
      ]
    })
    persistGeneratedIssueDrafts(db, {
      runId: run.id,
      repoId: repo.id,
      selectedNoteIds: notes.map((note) => note.id),
      drafts: plan.drafts,
      eventStream: [{ type: 'final', drafts: plan.drafts, autoPublishPreview: plan.summary }]
    })
    const createIssue = vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://github.com/nick-neely/pilog/issues/51',
        number: 51
      })
      .mockResolvedValueOnce({
        url: 'https://github.com/nick-neely/pilog/issues/52',
        number: 52
      })

    const report = await publishAutoPublishRun(db, { runId: run.id }, createIssue)

    expect(report).toMatchObject({
      runId: run.id,
      repoId: repo.id,
      successCount: 2,
      failureCount: 0
    })
    expect(createIssue).toHaveBeenCalledTimes(2)
    expect(listPublishLog(db, { repoId: repo.id })).toHaveLength(2)
    expect(listNotes(db).map((note) => [note.id, note.status])).toEqual(
      expect.arrayContaining([
        [first.id, 'published'],
        [second.id, 'published']
      ])
    )
  })

  it('persists split drafts that share one source note', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, {
      content: 'show avatar in settings; style settings scrollbar',
      repoId: repo.id
    })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })

    const draftIds = persistGeneratedIssueDrafts(db, {
      runId: run.id,
      repoId: repo.id,
      selectedNoteIds: [note.id],
      drafts: [
        { ...draft, title: 'Show avatar in settings', sourceNoteIds: [note.id] },
        { ...draft, title: 'Style settings scrollbar', sourceNoteIds: [note.id] }
      ],
      eventStream: [{ type: 'final' }]
    })

    const persistedDrafts = db.select().from(issueDrafts).all()

    expect(draftIds).toHaveLength(2)
    expect(persistedDrafts.map((persisted) => persisted.title)).toEqual([
      'Show avatar in settings',
      'Style settings scrollbar'
    ])
    expect(listNotes(db).map((persisted) => persisted.status)).toEqual(['drafted'])
  })

  it('allows a selected source note to back multiple generated drafts', () => {
    expect(
      validateAndCollectSourceNoteIds(
        ['note-1', 'note-2'],
        [
          { ...draft, sourceNoteIds: ['note-1'] },
          { ...draft, title: 'Second draft', sourceNoteIds: ['note-1'] }
        ]
      )
    ).toEqual(['note-1'])
  })

  it('rejects drafts that reference unselected source notes', () => {
    expect(() =>
      validateAndCollectSourceNoteIds(
        ['note-1'],
        [{ ...draft, sourceNoteIds: ['note-1', 'note-2'] }]
      )
    ).toThrow('references an unselected source note')
  })

  it('terminates the exit tool after the first valid submit call', async () => {
    const submitted: GeneratedIssueDraft[][] = []
    const tool = createSubmitIssueDraftsTool((drafts) => submitted.push(drafts))

    const result = await tool.execute('tool-1', { drafts: [draft] })
    const second = await tool.execute('tool-2', { drafts: [draft] })

    expect(result.terminate).toBe(true)
    expect(second.terminate).toBe(true)
    expect(submitted).toHaveLength(1)
  })

  it('accepts fixture responses for merge, split, parent/subtask, single-draft, and clarification shapes', () => {
    expect(GeneratedIssueDraftsSchema.parse(threeDraftResponse)).toHaveLength(3)
    expect(threeDraftResponse[0]?.groupingReason).toContain('src/settings/SettingsForm.tsx')
    expect(threeDraftResponse[1]?.groupingReason).toContain('parent-with-subtasks')
    expect(GeneratedIssueDraftsSchema.parse(singleDraftResponse)).toHaveLength(1)
    expect(GeneratedIssueDraftsSchema.parse(clarificationResponse)[0]?.needsClarification).toEqual(
      expect.arrayContaining(['Which dashboard screen or component is affected?'])
    )
  })

  it('rejects malformed fixture output cleanly', () => {
    const malformed = [{ ...draft, affectedFiles: [], acceptanceCriteria: [], groupingReason: '' }]

    expect(() => GeneratedIssueDraftsSchema.parse(malformed)).toThrow()
  })
})
