import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import {
  createRepo,
  listRepos,
  getRepoById,
  deleteRepo,
  updateRepoAutoPublishSettings
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
    const repo = createRepo(db, sampleInput)

    expect(repo.id).toBeDefined()
    expect(repo.name).toBe('pilog')
    expect(repo.owner).toBe('nick-neely')
    expect(repo.localPath).toBe('/home/user/projects/pilog')
    expect(repo.githubUrl).toBe('https://github.com/nick-neely/pilog')
    expect(repo.defaultBranch).toBe('main')
    expect(repo.autoPublishEnabled).toBe(false)
    expect(repo.autoPublishMaxIssuesPerRun).toBe(5)
    expect(repo.autoPublishDefaultLabel).toBe('triaged-by-pilog')
    expect(repo.autoPublishDryRun).toBe(false)
    expect(repo.autoPublishRequireConfirmation).toBe(true)
    expect(repo.createdAt).toBeDefined()
    expect(repo.updatedAt).toBeDefined()
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
