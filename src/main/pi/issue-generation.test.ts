import { DEFAULT_REPO_DRAFT_SETTINGS, type Note, type Repo } from '@shared/ipc'
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
import {
  createIssueDraft,
  addClarificationAnswer,
  getIssueDraftById
} from '../db/repositories/issue-drafts'
import { upsertRepoIndex } from '../db/repositories/repo-indices'
import { createRepo } from '../db/repositories/repos'
import { agentRuns, issueDrafts } from '../db/schema'
import { publishAutoPublishRun } from '../github/publish-draft'
import {
  planAutoPublishPreviewDrafts,
  buildIssueGenerationPrompt,
  createSubmitIssueDraftsTool,
  hydrateRepoLabelsIfNeeded,
  refreshRepoLabelsIfStale,
  getCurrentInboxNotesForGeneration,
  getClarificationDraftForRegeneration,
  getSelectedNotesForGeneration,
  persistGeneratedIssueDrafts,
  persistRegeneratedClarificationDraft,
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

const promptRepo: Repo = {
  id: 'repo-1',
  owner: 'nick-neely',
  name: 'pilog',
  localPath: '/workspace/pilog',
  accessKind: 'host',
  wslDistro: null,
  wslPath: null,
  githubUrl: 'https://github.com/nick-neely/pilog',
  defaultBranch: 'main',
  autoPublishEnabled: false,
  autoPublishMaxIssuesPerRun: 5,
  autoPublishDefaultLabel: 'triaged-by-pilog',
  autoPublishDryRun: false,
  autoPublishRequireConfirmation: true,
  autoPublishMinimumConfidence: 'high',
  autoPublishRequireKnownAffectedFiles: true,
  ...DEFAULT_REPO_DRAFT_SETTINGS,
  allowDiffSummaryCapture: false,
  githubLabels: [],
  githubLabelsSyncedAt: null,
  createdAt: '2026-05-08T00:00:00.000Z',
  updatedAt: '2026-05-08T00:00:00.000Z'
}

const promptNote: Note = {
  id: 'note-1',
  content: 'settings page spacing is weird on mobile',
  status: 'unprocessed',
  repoId: 'repo-1',
  runId: null,
  captureContext: null,
  createdAt: '2026-05-08T00:00:00.000Z',
  updatedAt: '2026-05-08T00:00:00.000Z'
}

describe('issue generation', () => {
  it('assembles the PRD-guided prompt with repo path and selected notes', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: {
        ...promptRepo,
        githubLabels: [
          { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' },
          { id: 2, name: 'ready-for-agent', color: '0e8a16', description: null }
        ],
        githubLabelsSyncedAt: '2026-05-11T00:00:00.000Z'
      },
      notes: [promptNote]
    })

    expect(prompt).toMatchSnapshot()
    expect(prompt).toContain('Do not create one issue per note by default.')
    expect(prompt).toContain('Group related minor UX notes.')
    expect(prompt).toContain('Split unrelated or complex notes.')
    expect(prompt).toContain('parent issue with checklist subtasks')
    expect(prompt).toContain('Return structured JSON only')
    expect(prompt).toContain('Mark vague notes as needing clarification.')
    expect(prompt).toContain('Prefer exact label names from the cached GitHub label vocabulary')
    expect(prompt).toContain('Repo Index navigation context:')
    expect(prompt).toContain('status: unavailable')
    expect(prompt).toContain('No Repo Index is available. Fall back to bounded live traversal')
    expect(prompt).toContain('Live Repo Evidence:')
    expect(prompt).toContain('Capture Context and Repo Index are not verified current evidence.')
    expect(prompt).toContain('- bug: Something is broken')
    expect(prompt).toContain('- ready-for-agent')
  })

  it('includes a ready Repo Index as navigation context without treating it as evidence', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: {
        ...promptRepo,
        repoIndex: {
          status: 'ready',
          lastIndexedAt: '2026-05-14T18:30:00.000Z',
          indexVersion: 1,
          packageManager: 'pnpm',
          frameworkSignals: ['Electron', 'React', 'Vite'],
          importantDirectories: [
            { path: 'src/main/pi', role: 'issue generation runtime' },
            { path: 'src/main/pi/tools', role: 'bounded live repo tools' }
          ],
          exclusionSummary: {
            dependency: 1200,
            buildOutput: 4,
            generated: 2,
            binaryHeavy: 1,
            ignored: 8
          },
          errorMessage: null
        }
      },
      notes: [
        {
          ...promptNote,
          content: 'draft generation starts blind and searches too broadly'
        }
      ]
    })

    expect(prompt).toContain('Treat the Repo Index as navigation context only')
    expect(prompt).toContain('must be grounded in Live Repo Evidence')
    expect(prompt).toContain('Repo Index navigation context:')
    expect(prompt).toContain('status: ready')
    expect(prompt).toContain('lastIndexedAt: 2026-05-14T18:30:00.000Z')
    expect(prompt).toContain('packageManager: pnpm')
    expect(prompt).toContain('frameworkSignals: Electron, React, Vite')
    expect(prompt).toContain('- src/main/pi: issue generation runtime')
    expect(prompt).toContain('- src/main/pi/tools: bounded live repo tools')
    expect(prompt).toContain('- dependency: 1200')
    expect(prompt).toContain(
      'Use the available read-only repo tools to verify specific draft claims'
    )
  })

  it('includes per-note Capture Context as note-time context', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: promptRepo,
      notes: [
        {
          ...promptNote,
          captureContext: {
            state: 'captured',
            branch: 'feature/capture-context',
            dirtyFiles: ['src/main/pi/issue-generation.ts', 'src/shared/types.ts'],
            stagedFiles: ['src/main/db/repositories/notes.ts'],
            headSha: 'abc1234',
            headSubject: 'Store capture context with new notes',
            capturedAt: '2026-05-14T21:15:00.000Z'
          }
        }
      ]
    })

    expect(prompt).toContain('Treat Capture Context as note-time context only')
    expect(prompt).toContain('Capture Context can guide live repo inspection')
    expect(prompt).toContain('captureContext:')
    expect(prompt).toContain('state: captured')
    expect(prompt).toContain('branch: feature/capture-context')
    expect(prompt).toContain('dirtyFiles:')
    expect(prompt).toContain('- src/main/pi/issue-generation.ts')
    expect(prompt).toContain('- src/shared/types.ts')
    expect(prompt).toContain('stagedFiles:')
    expect(prompt).toContain('- src/main/db/repositories/notes.ts')
    expect(prompt).toContain('headSha: abc1234')
    expect(prompt).toContain('headSubject: Store capture context with new notes')
    expect(prompt).toContain('capturedAt: 2026-05-14T21:15:00.000Z')
  })

  it('keeps older notes without Capture Context usable', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: promptRepo,
      notes: [{ ...promptNote, captureContext: null }]
    })

    expect(prompt).toContain('captureContext:')
    expect(prompt).toContain('(none recorded for this note)')
    expect(prompt).toContain('content:\nsettings page spacing is weird on mobile')
  })

  it('includes Capture Context alongside Repo Index navigation context', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: {
        ...promptRepo,
        repoIndex: {
          status: 'ready',
          lastIndexedAt: '2026-05-14T18:30:00.000Z',
          indexVersion: 1,
          packageManager: 'pnpm',
          frameworkSignals: ['Electron', 'React'],
          importantDirectories: [{ path: 'src/main/pi', role: 'issue generation runtime' }],
          exclusionSummary: {
            dependency: 1200,
            buildOutput: 4,
            generated: 2,
            binaryHeavy: 1,
            ignored: 8
          },
          errorMessage: null
        }
      },
      notes: [
        {
          ...promptNote,
          captureContext: {
            state: 'captured',
            branch: 'feature/context-quality',
            dirtyFiles: ['src/main/pi/issue-generation.ts'],
            stagedFiles: [],
            headSha: null,
            headSubject: null,
            capturedAt: '2026-05-14T21:30:00.000Z'
          }
        }
      ]
    })

    expect(prompt).toContain('Repo Index navigation context:')
    expect(prompt).toContain('- src/main/pi: issue generation runtime')
    expect(prompt).toContain('captureContext:')
    expect(prompt).toContain('branch: feature/context-quality')
    expect(prompt).toContain('- src/main/pi/issue-generation.ts')
    expect(prompt).toContain('Live Repo Evidence:')
    expect(prompt).toContain('Capture Context and Repo Index are not verified current evidence.')
  })

  it('includes active issue style and draft content toggle settings', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: {
        ...promptRepo,
        issueStyleDepth: 'detailed',
        issueStyleAudience: 'open_source',
        draftContentToggles: {
          includeImplementationNotes: false,
          includeAffectedFiles: true,
          includeSourceNotes: false,
          includeAcceptanceCriteria: true,
          includeConfidenceRationale: false,
          includeReproductionSteps: true
        }
      },
      notes: [promptNote]
    })

    expect(prompt).toContain('Active Issue Style:')
    expect(prompt).toContain('depth: detailed')
    expect(prompt).toContain('audience: open_source')
    expect(prompt).toContain('Active Draft Content Toggles:')
    expect(prompt).toContain('includeImplementationNotes: false')
    expect(prompt).toContain('includeSourceNotes: false')
    expect(prompt).toContain('includeConfidenceRationale: false')
    expect(prompt).toContain('includeReproductionSteps: true')
  })

  it('includes Clarification History when regenerating a clarification draft', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: promptRepo,
      notes: [promptNote],
      clarificationHistory: [
        {
          question: 'Which dashboard screen is affected?',
          answer: 'The repository activity chart on the overview screen.',
          answeredAt: '2026-05-14T21:45:00.000Z'
        }
      ]
    })

    expect(prompt).toContain('Clarification History:')
    expect(prompt).toContain('Clarification 1')
    expect(prompt).toContain('answeredAt: 2026-05-14T21:45:00.000Z')
    expect(prompt).toContain('question: Which dashboard screen is affected?')
    expect(prompt).toContain('answer: The repository activity chart on the overview screen.')
  })

  it('requires live inspection before claiming a file suggested by the Repo Index', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: {
        ...promptRepo,
        repoIndex: {
          status: 'ready',
          lastIndexedAt: '2026-05-14T18:30:00.000Z',
          indexVersion: 1,
          packageManager: 'pnpm',
          frameworkSignals: ['Electron', 'React'],
          importantDirectories: [
            { path: 'src/main/pi', role: 'issue generation runtime' },
            { path: 'src/renderer/src/features/drafts', role: 'draft review UI candidate' }
          ],
          exclusionSummary: {
            dependency: 1200,
            buildOutput: 4,
            generated: 2,
            binaryHeavy: 1,
            ignored: 8
          },
          errorMessage: null
        }
      },
      notes: [
        {
          ...promptNote,
          content: 'draft review should show which file claim was verified'
        }
      ]
    })

    expect(prompt).toContain('- src/renderer/src/features/drafts: draft review UI candidate')
    expect(prompt).toContain(
      'A Repo Index path is only a lead; read or search the live file before naming it in affectedFiles, context, implementationNotes, or acceptanceCriteria.'
    )
    expect(prompt).toContain(
      'affectedFiles[].reason must explain the live inspection that supports the path, not only repeat Repo Index metadata.'
    )
  })

  it('instructs clarification or lower confidence when live evidence cannot support a specific claim', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: promptRepo,
      notes: [
        {
          ...promptNote,
          content: 'the dashboard thing is off after onboarding'
        }
      ]
    })

    expect(prompt).toContain(
      'When live tools cannot verify a specific file, route, component, or behavior, avoid the specific claim or mark the draft low confidence with needsClarification questions.'
    )
  })

  it('keeps generation guidance usable when Repo Index creation failed', () => {
    const prompt = buildIssueGenerationPrompt({
      repo: {
        ...promptRepo,
        repoIndex: {
          status: 'failed',
          lastIndexedAt: null,
          indexVersion: 1,
          packageManager: null,
          frameworkSignals: [],
          importantDirectories: [],
          exclusionSummary: {
            dependency: 0,
            buildOutput: 0,
            generated: 0,
            binaryHeavy: 0,
            ignored: 0
          },
          errorMessage: 'Repository path was unavailable.'
        }
      },
      notes: []
    })

    expect(prompt).toContain('status: failed')
    expect(prompt).toContain('errorMessage: Repository path was unavailable.')
    expect(prompt).toContain('Index creation failed. Fall back to bounded live traversal')
  })

  it('loads the persisted Repo Index when selecting notes for generation', () => {
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
      content: 'use repo index before broad traversal',
      repoId: repo.id
    })
    upsertRepoIndex(db, repo.id, {
      status: 'ready',
      indexVersion: 1,
      lastIndexedAt: '2026-05-14T18:30:00.000Z',
      packageManager: 'pnpm',
      frameworkSignals: ['Electron'],
      importantDirectories: [{ path: 'src/main/pi', role: 'generation runtime' }],
      exclusionSummary: {
        dependency: 10,
        buildOutput: 1,
        generated: 0,
        binaryHeavy: 0,
        ignored: 2
      }
    })

    const selected = getSelectedNotesForGeneration(db, [note.id])

    expect(selected.repo.repoIndex).toMatchObject({
      status: 'ready',
      lastIndexedAt: '2026-05-14T18:30:00.000Z',
      packageManager: 'pnpm',
      frameworkSignals: ['Electron'],
      importantDirectories: [{ path: 'src/main/pi', role: 'generation runtime' }]
    })
    expect(buildIssueGenerationPrompt(selected)).toContain('- src/main/pi: generation runtime')
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

  it('refreshes stale repo labels before generation so prompt and matching use the updated cache', async () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main',
      githubLabels: [{ id: 1, name: 'bug', color: 'd73a4a', description: null }],
      githubLabelsSyncedAt: '2026-05-10T00:00:00.000Z'
    })
    const listLabels = vi.fn().mockResolvedValue([
      { id: 2, name: 'enhancement', color: 'a2eeef', description: 'New feature or request' },
      { id: 3, name: 'ready-for-agent', color: '0e8a16', description: null }
    ])

    const refreshed = await refreshRepoLabelsIfStale(db, repo, listLabels, {
      now: new Date('2026-05-11T02:00:00.000Z')
    })

    expect(listLabels).toHaveBeenCalledWith('nick-neely', 'pilog')
    expect(refreshed.githubLabels.map((label) => label.name)).toEqual([
      'enhancement',
      'ready-for-agent'
    ])
    expect(buildIssueGenerationPrompt({ repo: refreshed, notes: [] })).toContain(
      '- enhancement: New feature or request'
    )
    expect(
      planAutoPublishPreviewDrafts({
        runId: 'run-1',
        repo: {
          ...refreshed,
          autoPublishEnabled: true,
          autoPublishMinimumConfidence: 'medium',
          autoPublishDefaultLabel: 'ready-for-agent'
        },
        repoLabels: refreshed.githubLabels,
        drafts: [{ ...draft, sourceNoteIds: ['note-1'], suggestedLabels: ['Enhancement'] }]
      }).drafts[0]?.suggestedLabels
    ).toEqual(['enhancement', 'ready-for-agent'])

    await refreshRepoLabelsIfStale(db, refreshed, listLabels, {
      now: new Date('2026-05-11T03:00:00.000Z')
    })
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

  it('persists generated clarification drafts without adding a source note status', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'dashboard chart is off somewhere', repoId: repo.id })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })

    persistGeneratedIssueDrafts(db, {
      runId: run.id,
      repoId: repo.id,
      selectedNoteIds: [note.id],
      drafts: [
        {
          ...draft,
          publishReady: false,
          sourceNoteIds: [note.id],
          needsClarification: ['Which dashboard screen is affected?']
        }
      ],
      eventStream: [{ type: 'final' }]
    })

    expect(db.select().from(issueDrafts).get()).toMatchObject({
      status: 'draft',
      workflowState: 'needs_clarification',
      clarificationQuestions: JSON.stringify(['Which dashboard screen is affected?'])
    })
    expect(listNotes(db, { repoId: repo.id }).map((persisted) => persisted.status)).toEqual([
      'drafted'
    ])
  })

  it('loads source notes and answers for clarification draft regeneration', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'dashboard chart is off somewhere', repoId: repo.id })
    const clarificationDraft = createIssueDraft(db, {
      repoId: repo.id,
      draft: {
        ...draft,
        sourceNoteIds: [note.id],
        publishReady: false,
        needsClarification: ['Which dashboard screen is affected?']
      }
    })
    addClarificationAnswer(db, {
      id: clarificationDraft.id,
      question: 'Which dashboard screen is affected?',
      answer: 'The repository activity chart on the overview screen.'
    })

    const regeneration = getClarificationDraftForRegeneration(db, clarificationDraft.id)

    expect(regeneration.repo.id).toBe(repo.id)
    expect(regeneration.notes.map((sourceNote) => sourceNote.id)).toEqual([note.id])
    expect(regeneration.notes[0]?.content).toBe('dashboard chart is off somewhere')
    expect(regeneration.clarificationHistory).toMatchObject([
      {
        question: 'Which dashboard screen is affected?',
        answer: 'The repository activity chart on the overview screen.'
      }
    ])
  })

  it('replaces a clarification draft with a publish-ready regenerated draft without rewriting source notes', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'dashboard chart is off somewhere', repoId: repo.id })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })
    const clarificationDraft = createIssueDraft(db, {
      repoId: repo.id,
      draft: {
        ...draft,
        title: 'Clarify dashboard chart issue',
        sourceNoteIds: [note.id],
        publishReady: false,
        needsClarification: ['Which dashboard screen is affected?']
      }
    })
    const answeredDraft = addClarificationAnswer(db, {
      id: clarificationDraft.id,
      question: 'Which dashboard screen is affected?',
      answer: 'The repository activity chart on the overview screen.'
    })

    const draftIds = persistRegeneratedClarificationDraft(db, {
      runId: run.id,
      repoId: repo.id,
      clarificationDraftId: clarificationDraft.id,
      selectedNoteIds: [note.id],
      drafts: [
        {
          ...draft,
          title: 'Fix repository activity chart values',
          sourceNoteIds: [note.id],
          publishReady: true,
          needsClarification: []
        }
      ],
      eventStream: [{ type: 'final' }]
    })

    const regenerated = getIssueDraftById(db, clarificationDraft.id)
    expect(draftIds).toEqual([clarificationDraft.id])
    expect(regenerated).toMatchObject({
      title: 'Fix repository activity chart values',
      workflowState: 'ready',
      clarificationQuestions: [],
      clarificationHistory: answeredDraft?.clarificationHistory
    })
    expect(listNotes(db, { repoId: repo.id })[0]).toMatchObject({
      id: note.id,
      content: 'dashboard chart is off somewhere',
      status: 'unprocessed'
    })
  })

  it('keeps a regenerated clarification draft in clarification state when context is still insufficient', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'dashboard chart is off somewhere', repoId: repo.id })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })
    const clarificationDraft = createIssueDraft(db, {
      repoId: repo.id,
      draft: {
        ...draft,
        sourceNoteIds: [note.id],
        publishReady: false,
        needsClarification: ['Which dashboard screen is affected?']
      }
    })
    const answeredDraft = addClarificationAnswer(db, {
      id: clarificationDraft.id,
      question: 'Which dashboard screen is affected?',
      answer: 'The overview screen.'
    })

    persistRegeneratedClarificationDraft(db, {
      runId: run.id,
      repoId: repo.id,
      clarificationDraftId: clarificationDraft.id,
      selectedNoteIds: [note.id],
      drafts: [
        {
          ...draft,
          title: 'Clarify dashboard chart values',
          sourceNoteIds: [note.id],
          publishReady: false,
          needsClarification: ['Which chart value is incorrect?']
        }
      ],
      eventStream: [{ type: 'final' }]
    })

    expect(getIssueDraftById(db, clarificationDraft.id)).toMatchObject({
      title: 'Clarify dashboard chart values',
      workflowState: 'needs_clarification',
      clarificationQuestions: ['Which chart value is incorrect?'],
      clarificationHistory: answeredDraft?.clarificationHistory
    })
    expect(listNotes(db, { repoId: repo.id })[0]?.content).toBe('dashboard chart is off somewhere')
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
    const generatedDrafts: GeneratedIssueDraft[] = [
      {
        ...draft,
        title: 'Fix settings spacing',
        sourceNoteIds: [noteIds[0]!],
        suggestedLabels: ['bug', 'triaged-by-pilog'],
        confidence: 'high'
      },
      {
        ...draft,
        title: 'Handle avatar errors',
        sourceNoteIds: [noteIds[1]!],
        suggestedLabels: ['ux'],
        confidence: 'high'
      },
      {
        ...draft,
        title: 'Repair auth redirect',
        sourceNoteIds: [noteIds[2]!],
        suggestedLabels: [],
        confidence: 'high'
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
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'high',
        autoPublishRequireKnownAffectedFiles: true
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
      skippedDrafts: [],
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

  it('skips ineligible auto-publish preview drafts before applying max issue count', () => {
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
      'clarify vague note',
      'low confidence bug',
      'medium confidence change',
      'high confidence change',
      'missing file evidence',
      'second high confidence change'
    ].map((content) => createNote(db, { content, repoId: repo.id }).id)
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: noteIds })

    const plan = planAutoPublishPreviewDrafts({
      runId: run.id,
      repo: {
        ...repo,
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 2,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'high',
        autoPublishRequireKnownAffectedFiles: true
      },
      drafts: [
        {
          ...draft,
          title: 'Ask for reproduction details',
          sourceNoteIds: [noteIds[0]!],
          publishReady: false,
          needsClarification: ['Which route fails?'],
          confidence: 'medium'
        },
        {
          ...draft,
          title: 'Investigate flaky avatar upload',
          sourceNoteIds: [noteIds[1]!],
          confidence: 'low'
        },
        {
          ...draft,
          title: 'Polish settings spacing',
          sourceNoteIds: [noteIds[2]!],
          confidence: 'medium'
        },
        {
          ...draft,
          title: 'Repair auth redirect',
          sourceNoteIds: [noteIds[3]!],
          confidence: 'high'
        },
        {
          ...draft,
          title: 'Restore publish log empty state',
          sourceNoteIds: [noteIds[4]!],
          confidence: 'high',
          affectedFiles: []
        },
        {
          ...draft,
          title: 'Fix draft review copy',
          sourceNoteIds: [noteIds[5]!],
          confidence: 'high'
        }
      ]
    })

    expect(plan.drafts.map((planned) => planned.title)).toEqual([
      'Repair auth redirect',
      'Fix draft review copy'
    ])
    expect(plan.summary).toMatchObject({
      generatedDraftCount: 6,
      plannedDraftCount: 2,
      limited: false
    })
    expect(plan.summary.skippedDrafts).toEqual([
      {
        title: 'Ask for reproduction details',
        reason: 'Clarification drafts are not eligible.',
        sourceNoteIds: [noteIds[0]!],
        labels: draft.suggestedLabels
      },
      {
        title: 'Investigate flaky avatar upload',
        reason: 'Low-confidence drafts are not eligible.',
        sourceNoteIds: [noteIds[1]!],
        labels: draft.suggestedLabels
      },
      {
        title: 'Polish settings spacing',
        reason: 'Repo requires high confidence for auto-publish.',
        sourceNoteIds: [noteIds[2]!],
        labels: draft.suggestedLabels
      },
      {
        title: 'Restore publish log empty state',
        reason: 'Repo requires known affected files for auto-publish.',
        sourceNoteIds: [noteIds[4]!],
        labels: draft.suggestedLabels
      }
    ])
  })

  it('skips auto-publish drafts missing sections required by saved draft content toggles', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const noteIds = ['missing implementation notes', 'complete draft'].map((content) =>
      createNote(db, { content, repoId: repo.id })
    )
    const run = createAgentRun(db, {
      repoId: repo.id,
      inputNoteIds: noteIds.map((note) => note.id)
    })

    const plan = planAutoPublishPreviewDrafts({
      runId: run.id,
      repo: {
        ...repo,
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 5,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'medium',
        autoPublishRequireKnownAffectedFiles: false
      },
      drafts: [
        {
          ...draft,
          title: 'Repair settings spacing',
          sourceNoteIds: [noteIds[0]!.id],
          confidence: 'high',
          implementationNotes: []
        },
        {
          ...draft,
          title: 'Restore publish log empty state',
          sourceNoteIds: [noteIds[1]!.id],
          confidence: 'high'
        }
      ]
    })

    expect(plan.drafts.map((planned) => planned.title)).toEqual(['Restore publish log empty state'])
    expect(plan.summary.skippedDrafts).toEqual([
      {
        title: 'Repair settings spacing',
        reason: 'Repo requires saved draft content sections for auto-publish: implementation notes.',
        sourceNoteIds: [noteIds[0]!.id],
        labels: draft.suggestedLabels
      }
    ])
  })

  it('does not require draft content sections disabled in saved repo toggles for auto-publish', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'implementation notes are optional', repoId: repo.id })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })

    const plan = planAutoPublishPreviewDrafts({
      runId: run.id,
      repo: {
        ...repo,
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 5,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'medium',
        autoPublishRequireKnownAffectedFiles: false,
        draftContentToggles: {
          ...repo.draftContentToggles,
          includeImplementationNotes: false
        }
      },
      drafts: [
        {
          ...draft,
          title: 'Publish without implementation notes',
          sourceNoteIds: [note.id],
          confidence: 'high',
          implementationNotes: []
        }
      ]
    })

    expect(plan.drafts.map((planned) => planned.title)).toEqual([
      'Publish without implementation notes'
    ])
    expect(plan.summary.skippedDrafts).toEqual([])
  })

  it('allows medium-confidence drafts when the repo auto-publish threshold is medium', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      owner: 'nick-neely',
      name: 'pilog',
      localPath: '/workspace/pilog',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    const note = createNote(db, { content: 'settings spacing can publish', repoId: repo.id })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })

    const plan = planAutoPublishPreviewDrafts({
      runId: run.id,
      repo: {
        ...repo,
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 2,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'medium',
        autoPublishRequireKnownAffectedFiles: true
      },
      drafts: [{ ...draft, title: 'Polish settings spacing', sourceNoteIds: [note.id] }]
    })

    expect(plan.drafts.map((planned) => planned.title)).toEqual(['Polish settings spacing'])
    expect(plan.summary.skippedDrafts).toEqual([])
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
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'medium',
        autoPublishRequireKnownAffectedFiles: true
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
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'high',
        autoPublishRequireKnownAffectedFiles: true
      },
      drafts: [
        {
          ...draft,
          title: 'Add loading state to save button',
          sourceNoteIds: [first.id],
          suggestedLabels: [],
          confidence: 'high'
        },
        {
          ...draft,
          title: 'Fix settings spacing',
          sourceNoteIds: [second.id],
          suggestedLabels: ['ux'],
          confidence: 'high'
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
