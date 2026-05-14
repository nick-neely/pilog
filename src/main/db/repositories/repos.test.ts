import { describe, it, expect, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import {
  createRepo,
  listRepos,
  getRepoById,
  deleteRepo,
  updateRepoAutoPublishSettings,
  updateRepoDraftSettings
} from './repos'

describe('repos repository', () => {
  let db: PilogDatabase

  beforeEach(() => {
    db = createInMemoryDatabase()
    runMigrations(db)
  })

  const sampleInput = {
    name: 'pilog',
    owner: 'nick-neely',
    localPath: '/home/user/projects/pilog',
    githubUrl: 'https://github.com/nick-neely/pilog',
    defaultBranch: 'main'
  }

  it('creates a repo and returns it with all fields populated', () => {
    const repo = createRepo(db, {
      ...sampleInput,
      githubLabels: [
        { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' },
        { id: 2, name: 'ready-for-agent', color: '0e8a16', description: null }
      ],
      githubLabelsSyncedAt: '2026-05-11T00:00:00.000Z'
    })

    expect(repo.id).toBeDefined()
    expect(repo.name).toBe('pilog')
    expect(repo.owner).toBe('nick-neely')
    expect(repo.localPath).toBe('/home/user/projects/pilog')
    expect(repo.accessKind).toBe('host')
    expect(repo.wslDistro).toBeNull()
    expect(repo.wslPath).toBeNull()
    expect(repo.githubUrl).toBe('https://github.com/nick-neely/pilog')
    expect(repo.defaultBranch).toBe('main')
    expect(repo.autoPublishEnabled).toBe(false)
    expect(repo.autoPublishMaxIssuesPerRun).toBe(5)
    expect(repo.autoPublishDefaultLabel).toBe('triaged-by-pilog')
    expect(repo.autoPublishDryRun).toBe(false)
    expect(repo.autoPublishRequireConfirmation).toBe(true)
    expect(repo.issueStyleDepth).toBe('balanced')
    expect(repo.issueStyleAudience).toBe('internal')
    expect(repo.draftContentToggles).toEqual({
      includeImplementationNotes: true,
      includeAffectedFiles: true,
      includeSourceNotes: true,
      includeAcceptanceCriteria: true,
      includeConfidenceRationale: true,
      includeReproductionSteps: true
    })
    expect(repo.repoIndex).toBeNull()
    expect(repo.githubLabels).toEqual([
      { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' },
      { id: 2, name: 'ready-for-agent', color: '0e8a16', description: null }
    ])
    expect(repo.githubLabelsSyncedAt).toBe('2026-05-11T00:00:00.000Z')
    expect(repo.createdAt).toBeDefined()
    expect(repo.updatedAt).toBeDefined()
  })

  it('migrates and defaults cached GitHub labels for existing repos', () => {
    const legacyDb = createInMemoryDatabase()
    legacyDb.run(sql`
      CREATE TABLE repos (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner TEXT NOT NULL,
        local_path TEXT NOT NULL,
        github_url TEXT,
        default_branch TEXT,
        auto_publish_enabled INTEGER NOT NULL DEFAULT 0,
        auto_publish_max_issues_per_run INTEGER NOT NULL DEFAULT 5,
        auto_publish_default_label TEXT NOT NULL DEFAULT 'triaged-by-pilog',
        auto_publish_dry_run INTEGER NOT NULL DEFAULT 0,
        auto_publish_require_confirmation INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `)
    legacyDb.run(sql`
      INSERT INTO repos (
        id,
        name,
        owner,
        local_path,
        github_url,
        default_branch,
        created_at,
        updated_at
      )
      VALUES (
        'repo-legacy',
        'pilog',
        'nick-neely',
        '/home/user/projects/pilog',
        'https://github.com/nick-neely/pilog',
        'main',
        '2026-05-10T00:00:00.000Z',
        '2026-05-10T00:00:00.000Z'
      )
    `)

    runMigrations(legacyDb)

    expect(getRepoById(legacyDb, 'repo-legacy')).toMatchObject({
      accessKind: 'host',
      wslDistro: null,
      wslPath: null,
      githubLabels: [],
      githubLabelsSyncedAt: null,
      issueStyleDepth: 'balanced',
      issueStyleAudience: 'internal',
      draftContentToggles: {
        includeImplementationNotes: true,
        includeAffectedFiles: true,
        includeSourceNotes: true,
        includeAcceptanceCriteria: true,
        includeConfidenceRationale: true,
        includeReproductionSteps: true
      }
    })
  })

  it('persists WSL access metadata for linked repositories', () => {
    const repo = createRepo(db, {
      ...sampleInput,
      localPath: '\\\\wsl.localhost\\Ubuntu\\home\\user\\projects\\pilog',
      accessKind: 'wsl',
      wslDistro: 'Ubuntu',
      wslPath: '/home/user/projects/pilog'
    })

    expect(getRepoById(db, repo.id)).toMatchObject({
      localPath: '\\\\wsl.localhost\\Ubuntu\\home\\user\\projects\\pilog',
      accessKind: 'wsl',
      wslDistro: 'Ubuntu',
      wslPath: '/home/user/projects/pilog'
    })
  })

  it('persists conservative auto-publish defaults', () => {
    const created = createRepo(db, sampleInput)
    const found = getRepoById(db, created.id)

    expect(found).toMatchObject({
      autoPublishEnabled: false,
      autoPublishMaxIssuesPerRun: 5,
      autoPublishDefaultLabel: 'triaged-by-pilog',
      autoPublishDryRun: false,
      autoPublishRequireConfirmation: true
    })
  })

  it('persists draft generation defaults per repo', () => {
    const first = createRepo(db, sampleInput)
    const second = createRepo(db, { ...sampleInput, name: 'other', localPath: '/other' })

    const updated = updateRepoDraftSettings(db, first.id, {
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
    })

    expect(updated).toMatchObject({
      id: first.id,
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
    })
    expect(getRepoById(db, second.id)).toMatchObject({
      issueStyleDepth: 'balanced',
      issueStyleAudience: 'internal'
    })
  })

  it('normalizes invalid draft generation defaults before persistence', () => {
    const repo = createRepo(db, sampleInput)

    const updated = updateRepoDraftSettings(db, repo.id, {
      issueStyleDepth: 'short',
      issueStyleAudience: 'community',
      draftContentToggles: {
        includeImplementationNotes: 'yes',
        includeAffectedFiles: false,
        includeSourceNotes: false,
        includeAcceptanceCriteria: true,
        includeConfidenceRationale: true,
        includeReproductionSteps: 1
      }
    } as never)

    expect(updated).toMatchObject({
      issueStyleDepth: 'balanced',
      issueStyleAudience: 'internal',
      draftContentToggles: {
        includeImplementationNotes: true,
        includeAffectedFiles: false,
        includeSourceNotes: false,
        includeAcceptanceCriteria: true,
        includeConfidenceRationale: true,
        includeReproductionSteps: true
      }
    })
  })

  it('returns null when updating draft generation defaults for a missing repo', () => {
    const updated = updateRepoDraftSettings(db, 'non-existent', {
      issueStyleDepth: 'concise',
      issueStyleAudience: 'internal',
      draftContentToggles: {
        includeImplementationNotes: true,
        includeAffectedFiles: true,
        includeSourceNotes: true,
        includeAcceptanceCriteria: true,
        includeConfidenceRationale: true,
        includeReproductionSteps: true
      }
    })

    expect(updated).toBeNull()
  })

  it('updates auto-publish guardrails for one repo only', () => {
    const first = createRepo(db, sampleInput)
    const second = createRepo(db, { ...sampleInput, name: 'other', localPath: '/other' })

    const updated = updateRepoAutoPublishSettings(db, first.id, {
      autoPublishEnabled: true,
      autoPublishMaxIssuesPerRun: 2,
      autoPublishDefaultLabel: 'needs-triage',
      autoPublishDryRun: true,
      autoPublishRequireConfirmation: false
    })

    expect(updated).toMatchObject({
      id: first.id,
      autoPublishEnabled: true,
      autoPublishMaxIssuesPerRun: 2,
      autoPublishDefaultLabel: 'needs-triage',
      autoPublishDryRun: true,
      autoPublishRequireConfirmation: false
    })
    expect(getRepoById(db, second.id)).toMatchObject({
      autoPublishEnabled: false,
      autoPublishMaxIssuesPerRun: 5,
      autoPublishDefaultLabel: 'triaged-by-pilog',
      autoPublishDryRun: false,
      autoPublishRequireConfirmation: true
    })
  })

  it('returns null when updating auto-publish settings for a missing repo', () => {
    const updated = updateRepoAutoPublishSettings(db, 'non-existent', {
      autoPublishEnabled: true,
      autoPublishMaxIssuesPerRun: 1,
      autoPublishDefaultLabel: 'triaged-by-pilog',
      autoPublishDryRun: false,
      autoPublishRequireConfirmation: true
    })

    expect(updated).toBeNull()
  })

  it('lists all repos', () => {
    createRepo(db, sampleInput)
    createRepo(db, { ...sampleInput, name: 'other', localPath: '/other', githubUrl: null })

    const repos = listRepos(db)
    expect(repos).toHaveLength(2)
  })

  it('returns empty array when no repos exist', () => {
    expect(listRepos(db)).toEqual([])
  })

  it('finds a repo by id', () => {
    const created = createRepo(db, sampleInput)
    const found = getRepoById(db, created.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
    expect(found!.name).toBe('pilog')
  })

  it('returns null for a non-existent id', () => {
    const found = getRepoById(db, 'non-existent')
    expect(found).toBeNull()
  })

  it('deletes a repo and returns true', () => {
    const repo = createRepo(db, sampleInput)
    const result = deleteRepo(db, repo.id)

    expect(result).toBe(true)
    expect(listRepos(db)).toHaveLength(0)
  })

  it('returns false when deleting a non-existent repo', () => {
    const result = deleteRepo(db, 'non-existent')
    expect(result).toBe(false)
  })

  it('allows nullable githubUrl', () => {
    const repo = createRepo(db, { ...sampleInput, githubUrl: null })
    expect(repo.githubUrl).toBeNull()
  })
})
