import { describe, expect, it, vi } from 'vitest'
import { createInMemoryDatabase } from './db/client'
import { runMigrations } from './db/migrations'
import { createIssueDraft, listIssueDrafts } from './db/repositories/issue-drafts'
import { createRepo } from './db/repositories/repos'
import { createPathActions } from './file-actions'
import type { GeneratedIssueDraft } from '@shared/types'

const generatedDraft: GeneratedIssueDraft = {
  title: 'Add loading state',
  summary: 'The save button needs a loading state.',
  context: 'A rough note mentioned the save flow.',
  sourceNoteIds: ['note-1'],
  suggestedLabels: ['bug'],
  affectedFiles: [{ path: 'src/save.ts', reason: 'Likely save flow' }],
  acceptanceCriteria: ['Save shows progress while pending'],
  implementationNotes: [],
  confidence: 'medium',
  groupingReason: 'Single save-flow note',
  publishReady: true
}

describe('path actions', () => {
  it('copies paths and reports missing paths before reveal', async () => {
    const writeText = vi.fn()
    const showItemInFolder = vi.fn()
    const exists = vi.fn((path: string) => path === '/repo/src/save.ts')
    const actions = createPathActions({ writeText, showItemInFolder, exists })

    await expect(actions.copyPath({ path: '/repo/src/save.ts' })).resolves.toEqual({ ok: true })
    expect(writeText).toHaveBeenCalledWith('/repo/src/save.ts')

    await expect(actions.revealPath({ path: 'src/save.ts', repoPath: '/repo' })).resolves.toEqual({
      ok: true
    })
    expect(showItemInFolder).toHaveBeenCalledWith('/repo/src/save.ts')

    await expect(
      actions.revealPath({ path: 'src/missing.ts', repoPath: '/repo' })
    ).resolves.toEqual({
      ok: false,
      reason: 'missing'
    })
    expect(showItemInFolder).toHaveBeenCalledTimes(1)
  })

  it('reveals an affected file path from a persisted draft', async () => {
    const db = createInMemoryDatabase()
    runMigrations(db)
    const repo = createRepo(db, {
      name: 'pilog',
      owner: 'nick-neely',
      localPath: '/repo',
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main'
    })
    createIssueDraft(db, { repoId: repo.id, draft: generatedDraft })
    const [draft] = listIssueDrafts(db)
    const [file] = draft.affectedFiles
    const showItemInFolder = vi.fn()
    const actions = createPathActions({
      writeText: vi.fn(),
      showItemInFolder,
      exists: (path) => path === '/repo/src/save.ts'
    })

    await expect(
      actions.revealPath({ path: file.path, repoPath: repo.localPath })
    ).resolves.toEqual({
      ok: true
    })
    expect(showItemInFolder).toHaveBeenCalledWith('/repo/src/save.ts')
  })
})
