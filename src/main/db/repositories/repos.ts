import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { repos } from '../schema'
import type { Repo, UpdateRepoAutoPublishSettingsRequest } from '@shared/ipc'

const repoColumns = {
  id: repos.id,
  name: repos.name,
  owner: repos.owner,
  localPath: repos.localPath,
  githubUrl: repos.githubUrl,
  defaultBranch: repos.defaultBranch,
  autoPublishEnabled: repos.autoPublishEnabled,
  autoPublishMaxIssuesPerRun: repos.autoPublishMaxIssuesPerRun,
  autoPublishDefaultLabel: repos.autoPublishDefaultLabel,
  autoPublishDryRun: repos.autoPublishDryRun,
  autoPublishRequireConfirmation: repos.autoPublishRequireConfirmation,
  createdAt: repos.createdAt,
  updatedAt: repos.updatedAt
} as const

export function createRepo(
  db: PilogDatabase,
  input: {
    name: string
    owner: string
    localPath: string
    githubUrl: string | null
    defaultBranch: string | null
  }
): Repo {
  const now = new Date().toISOString()
  const id = uuidv4()

  db.insert(repos)
    .values({
      id,
      name: input.name,
      owner: input.owner,
      localPath: input.localPath,
      githubUrl: input.githubUrl ?? undefined,
      defaultBranch: input.defaultBranch ?? undefined,
      autoPublishEnabled: false,
      autoPublishMaxIssuesPerRun: 5,
      autoPublishDefaultLabel: 'triaged-by-pilog',
      autoPublishDryRun: false,
      autoPublishRequireConfirmation: true,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return {
    id,
    name: input.name,
    owner: input.owner,
    localPath: input.localPath,
    githubUrl: input.githubUrl,
    defaultBranch: input.defaultBranch,
    autoPublishEnabled: false,
    autoPublishMaxIssuesPerRun: 5,
    autoPublishDefaultLabel: 'triaged-by-pilog',
    autoPublishDryRun: false,
    autoPublishRequireConfirmation: true,
    createdAt: now,
    updatedAt: now
  }
}

export function listRepos(db: PilogDatabase): Repo[] {
  return db.select(repoColumns).from(repos).all()
}

export function getRepoById(db: PilogDatabase, id: string): Repo | null {
  const row = db.select(repoColumns).from(repos).where(eq(repos.id, id)).get()
  return row ?? null
}

export function updateRepoAutoPublishSettings(
  db: PilogDatabase,
  id: string,
  input: Omit<UpdateRepoAutoPublishSettingsRequest, 'id'>
): Repo | null {
  const now = new Date().toISOString()
  const maxIssuesPerRun = Math.max(1, Math.floor(input.autoPublishMaxIssuesPerRun))
  const defaultLabel = input.autoPublishDefaultLabel.trim() || 'triaged-by-pilog'

  db.update(repos)
    .set({
      autoPublishEnabled: input.autoPublishEnabled,
      autoPublishMaxIssuesPerRun: maxIssuesPerRun,
      autoPublishDefaultLabel: defaultLabel,
      autoPublishDryRun: input.autoPublishDryRun,
      autoPublishRequireConfirmation: input.autoPublishRequireConfirmation,
      updatedAt: now
    })
    .where(eq(repos.id, id))
    .run()

  return getRepoById(db, id)
}

export function deleteRepo(db: PilogDatabase, id: string): boolean {
  const result = db.delete(repos).where(eq(repos.id, id)).run()
  return result.changes > 0
}
