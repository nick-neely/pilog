import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { issueDrafts } from '../schema'
import { createIssueDraft } from './issue-drafts'
import { createNote } from './notes'
import { createRepo } from './repos'
import { recordPublish, listPublishLog, listPublishAuditLog } from './publish-log'
import type { GeneratedIssueDraft } from '@shared/types'

function insertDraft(db: PilogDatabase, repoId: string): string {
  const id = uuidv4()
  const now = new Date().toISOString()
  db.insert(issueDrafts)
    .values({
      id,
      repoId,
      title: 'Test draft',
      body: 'Test body',
      labels: '[]',
      sourceNoteIds: '[]',
      affectedFilesJson: '[]',
      confidence: 'medium',
      status: 'draft',
      createdAt: now,
      updatedAt: now
    })
    .run()
  return id
}

const sampleRepo = {
  name: 'pilog',
  owner: 'nick-neely',
  localPath: '/home/user/projects/pilog',
  githubUrl: 'https://github.com/nick-neely/pilog',
  defaultBranch: 'main'
}

const generatedDraft: GeneratedIssueDraft = {
  title: 'Fix save loading state',
  summary: 'The save button needs pending feedback.',
  context: 'A source note reported the save button does not show progress.',
  sourceNoteIds: [],
  suggestedLabels: ['bug'],
  affectedFiles: [{ path: 'src/save.ts', reason: 'Likely save flow' }],
  acceptanceCriteria: ['Save shows a pending state'],
  implementationNotes: ['Disable the button while saving'],
  confidence: 'medium',
  groupingReason: 'Single save-flow note',
  publishReady: true
}

describe('publish-log repository', () => {
  let db: PilogDatabase

  beforeEach(() => {
    db = createInMemoryDatabase()
    runMigrations(db)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records a hand-written publish (null draftId) and returns the entry', () => {
    const repo = createRepo(db, sampleRepo)
    const entry = recordPublish(db, {
      draftId: null,
      repoId: repo.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/1'
    })

    expect(entry.id).toBeDefined()
    expect(entry.draftId).toBeNull()
    expect(entry.repoId).toBe(repo.id)
    expect(entry.githubIssueUrl).toBe('https://github.com/nick-neely/pilog/issues/1')
    expect(entry.publishedAt).toBeDefined()
  })

  it('records a draft-backed publish with a real draftId', () => {
    const repo = createRepo(db, sampleRepo)
    const draftId = insertDraft(db, repo.id)
    const entry = recordPublish(db, {
      draftId,
      repoId: repo.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/2'
    })

    expect(entry.draftId).toBe(draftId)
  })

  it('lists all publish log entries for a repo', () => {
    const repo = createRepo(db, sampleRepo)
    recordPublish(db, {
      draftId: null,
      repoId: repo.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/1'
    })
    recordPublish(db, {
      draftId: null,
      repoId: repo.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/2'
    })

    const entries = listPublishLog(db, { repoId: repo.id })
    expect(entries).toHaveLength(2)
  })

  it('returns empty array when no entries exist for repo', () => {
    const repo = createRepo(db, sampleRepo)
    expect(listPublishLog(db, { repoId: repo.id })).toEqual([])
  })

  it('only returns entries for the requested repo', () => {
    const repo1 = createRepo(db, sampleRepo)
    const repo2 = createRepo(db, { ...sampleRepo, name: 'other', localPath: '/other' })

    recordPublish(db, {
      draftId: null,
      repoId: repo1.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/1'
    })
    recordPublish(db, {
      draftId: null,
      repoId: repo2.id,
      githubIssueUrl: 'https://github.com/nick-neely/other/issues/1'
    })

    const entries = listPublishLog(db, { repoId: repo1.id })
    expect(entries).toHaveLength(1)
    expect(entries[0].repoId).toBe(repo1.id)
  })

  it('entries are ordered most-recent first', () => {
    vi.useFakeTimers()
    const repo = createRepo(db, sampleRepo)

    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'))
    recordPublish(db, {
      draftId: null,
      repoId: repo.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/1'
    })

    vi.setSystemTime(new Date('2024-01-02T00:00:00.000Z'))
    recordPublish(db, {
      draftId: null,
      repoId: repo.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/2'
    })

    const entries = listPublishLog(db, { repoId: repo.id })
    expect(entries[0].githubIssueUrl).toBe('https://github.com/nick-neely/pilog/issues/2')
  })

  it('lists audit entries with repo, draft, and source-note context', () => {
    const repo = createRepo(db, {
      ...sampleRepo,
      githubLabels: [{ id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' }],
      githubLabelsSyncedAt: '2026-05-11T00:00:00.000Z'
    })
    const note = createNote(db, { content: 'save button needs loading state', repoId: repo.id })
    const draft = createIssueDraft(db, {
      repoId: repo.id,
      draft: { ...generatedDraft, sourceNoteIds: [note.id] }
    })

    recordPublish(db, {
      draftId: draft.id,
      repoId: repo.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/34'
    })

    expect(listPublishAuditLog(db)).toEqual([
      expect.objectContaining({
        draftId: draft.id,
        draftTitle: 'Fix save loading state',
        repo: expect.objectContaining({
          id: repo.id,
          name: 'pilog',
          owner: 'nick-neely',
          githubUrl: 'https://github.com/nick-neely/pilog',
          githubLabels: [
            { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' }
          ],
          githubLabelsSyncedAt: '2026-05-11T00:00:00.000Z'
        }),
        sourceNotes: [
          expect.objectContaining({
            id: note.id,
            content: 'save button needs loading state',
            status: 'unprocessed',
            repoId: repo.id
          })
        ]
      })
    ])
  })

  it('includes hand-written publishes without draft linkage in the same audit list', () => {
    const repo = createRepo(db, sampleRepo)
    recordPublish(db, {
      draftId: null,
      repoId: repo.id,
      githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/35'
    })

    expect(listPublishAuditLog(db)).toEqual([
      expect.objectContaining({
        draftId: null,
        draftTitle: null,
        sourceNotes: [],
        repo: expect.objectContaining({ id: repo.id, owner: 'nick-neely', name: 'pilog' })
      })
    ])
  })
})
