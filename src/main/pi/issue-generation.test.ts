import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createInMemoryDatabase } from '../db/client'
import { runMigrations } from '../db/migrations'
import { createAgentRun } from '../db/repositories/agent-runs'
import { createNote, listNotes } from '../db/repositories/notes'
import { createRepo } from '../db/repositories/repos'
import { agentRuns, issueDrafts } from '../db/schema'
import {
  buildIssueGenerationPrompt,
  persistGeneratedIssueDrafts,
  createSubmitIssueDraftsTool
} from './issue-generation'
import type { GeneratedIssueDraft } from '@shared/types'

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
        createdAt: '2026-05-08T00:00:00.000Z',
        updatedAt: '2026-05-08T00:00:00.000Z'
      },
      notes: [
        {
          id: 'note-1',
          content: 'settings page spacing is weird on mobile',
          status: 'unprocessed',
          repoId: 'repo-1',
          createdAt: '2026-05-08T00:00:00.000Z',
          updatedAt: '2026-05-08T00:00:00.000Z'
        }
      ]
    })

    expect(prompt).toMatchSnapshot()
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

  it('terminates the exit tool after the first valid submit call', async () => {
    const submitted: GeneratedIssueDraft[][] = []
    const tool = createSubmitIssueDraftsTool((drafts) => submitted.push(drafts))

    const result = await tool.execute('tool-1', { drafts: [draft] })
    const second = await tool.execute('tool-2', { drafts: [draft] })

    expect(result.terminate).toBe(true)
    expect(second.terminate).toBe(true)
    expect(submitted).toHaveLength(1)
  })
})
