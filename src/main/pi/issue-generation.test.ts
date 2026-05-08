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
  createSubmitIssueDraftsTool,
  assertNoSourceNoteCollisions
} from './issue-generation'
import { GeneratedIssueDraftsSchema, type GeneratedIssueDraft } from '@shared/types'
import {
  clarificationResponse,
  singleDraftResponse,
  threeDraftResponse
} from '../../../fixtures/agent/fixture-responses'

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
    expect(prompt).toContain('Do not create one issue per note by default.')
    expect(prompt).toContain('Group related minor UX notes.')
    expect(prompt).toContain('Split unrelated or complex notes.')
    expect(prompt).toContain('parent issue with checklist subtasks')
    expect(prompt).toContain('Return structured JSON only')
    expect(prompt).toContain('Mark vague notes as needing clarification.')
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

  it('rejects source-note collisions within one generated run', () => {
    expect(() =>
      assertNoSourceNoteCollisions(
        ['note-1', 'note-2'],
        [
          { ...draft, sourceNoteIds: ['note-1'] },
          { ...draft, title: 'Second draft', sourceNoteIds: ['note-1'] }
        ]
      )
    ).toThrow('appears in more than one generated draft')
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
