import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { createIssueDraft } from './issue-drafts'
import { createNote } from './notes'
import { createRepo } from './repos'
import {
  cancelRunningAgentRuns,
  createAgentRun,
  finalizeAgentRun,
  getRunById,
  listRuns,
  updateAgentRunEventStream
} from './agent-runs'
import type { GeneratedIssueDraft } from '@shared/types'

const draft: GeneratedIssueDraft = {
  title: 'Add loading state',
  summary: 'The save button needs a loading state.',
  context: 'A rough note mentioned the save flow.',
  sourceNoteIds: [],
  suggestedLabels: ['bug'],
  affectedFiles: [{ path: 'src/save.ts', reason: 'Likely save flow' }],
  acceptanceCriteria: ['Save shows progress while pending'],
  implementationNotes: ['Keep the button disabled while pending'],
  confidence: 'medium',
  groupingReason: 'Single save-flow note',
  publishReady: true
}

describe('agent-runs repository', () => {
  let db: PilogDatabase

  beforeEach(() => {
    db = createInMemoryDatabase()
    runMigrations(db)
  })

  it('lists runs newest-first and filters by cancelled status', () => {
    const repo = createFixtureRepo(db)
    const note = createNote(db, { content: 'first', repoId: repo.id })
    const running = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })
    const cancelled = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })

    finalizeAgentRun(db, {
      id: cancelled.id,
      status: 'cancelled',
      errorMessage: 'Generation cancelled.',
      errorCause: 'cancelled',
      eventStream: [{ type: 'agent_end', reason: 'cancelled' }]
    })

    expect(listRuns(db).map((run) => run.id)).toEqual([cancelled.id, running.id])
    expect(listRuns(db, { status: 'cancelled' })).toMatchObject([
      {
        id: cancelled.id,
        status: 'cancelled',
        inputNoteCount: 1,
        outputDraftCount: 0,
        errorMessage: 'Generation cancelled.'
      }
    ])
  })

  it('gets a run with source notes, output drafts, and full event stream', () => {
    const repo = createFixtureRepo(db)
    const firstNote = createNote(db, { content: 'save button needs loading', repoId: repo.id })
    const secondNote = createNote(db, { content: 'show pending state', repoId: repo.id })
    const outputDraft = createIssueDraft(db, {
      repoId: repo.id,
      draft: { ...draft, sourceNoteIds: [firstNote.id, secondNote.id] }
    })
    const eventStream = [
      { type: 'agent_start', runId: 'run-1' },
      { type: 'tool_execution_start', toolName: 'submit_issue_drafts' },
      { type: 'agent_end', reason: 'success' }
    ]
    const run = createAgentRun(db, {
      repoId: repo.id,
      inputNoteIds: [secondNote.id, firstNote.id]
    })

    finalizeAgentRun(db, {
      id: run.id,
      status: 'succeeded',
      outputDraftIds: [outputDraft.id],
      eventStream
    })

    const detail = getRunById(db, run.id)

    expect(detail).not.toBeNull()
    expect(detail?.inputNoteIds).toEqual([secondNote.id, firstNote.id])
    expect(detail?.sourceNotes.map((note) => note.id)).toEqual([secondNote.id, firstNote.id])
    expect(detail?.outputDrafts).toMatchObject([
      {
        id: outputDraft.id,
        title: 'Add loading state',
        labels: ['bug'],
        affectedFiles: [{ path: 'src/save.ts', reason: 'Likely save flow' }]
      }
    ])
    expect(detail?.eventStream).toEqual(eventStream)
    expect(detail?.durationMs).toEqual(expect.any(Number))
  })

  it('updates the event stream while a run is still running', () => {
    const repo = createFixtureRepo(db)
    const note = createNote(db, { content: 'first', repoId: repo.id })
    const run = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })

    updateAgentRunEventStream(db, {
      id: run.id,
      eventStream: [{ type: 'progress', phase: 'agent_start' }]
    })

    expect(getRunById(db, run.id)?.eventStream).toEqual([
      { type: 'progress', phase: 'agent_start' }
    ])
    expect(getRunById(db, run.id)?.status).toBe('running')
  })

  it('cancels running runs on startup recovery', () => {
    const repo = createFixtureRepo(db)
    const note = createNote(db, { content: 'first', repoId: repo.id })
    const running = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })
    const finished = createAgentRun(db, { repoId: repo.id, inputNoteIds: [note.id] })
    finalizeAgentRun(db, {
      id: finished.id,
      status: 'succeeded',
      eventStream: [{ type: 'final' }]
    })

    cancelRunningAgentRuns(db, 'App restarted before generation finished.')

    expect(getRunById(db, running.id)).toMatchObject({
      status: 'cancelled',
      errorMessage: 'App restarted before generation finished.',
      errorCause: 'cancelled'
    })
    expect(getRunById(db, finished.id)?.status).toBe('succeeded')
  })
})

function createFixtureRepo(db: PilogDatabase): ReturnType<typeof createRepo> {
  return createRepo(db, {
    name: 'fixture',
    owner: 'pilog',
    localPath: '/tmp/pilog-fixture',
    githubUrl: 'https://github.com/pilog/fixture',
    defaultBranch: 'main'
  })
}
