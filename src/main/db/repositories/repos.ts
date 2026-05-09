import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { repos } from '../schema'
import {
  DEFAULT_REPO_AUTO_PUBLISH_SETTINGS,
  normalizeRepoAutoPublishSettings,
  type Repo,
  type UpdateRepoAutoPublishSettingsRequest
} from '@shared/ipc'

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
      ...DEFAULT_REPO_AUTO_PUBLISH_SETTINGS,
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
    ...DEFAULT_REPO_AUTO_PUBLISH_SETTINGS,
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
  const settings = normalizeRepoAutoPublishSettings(input)

  db.update(repos)
    .set({
      ...settings,
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
