import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { repos } from '../schema'
import {
  DEFAULT_REPO_AUTO_PUBLISH_SETTINGS,
  normalizeRepoAutoPublishSettings,
  type GitHubLabel,
  type Repo,
  type RepoAccessKind,
  type UpdateRepoAutoPublishSettingsRequest
} from '@shared/ipc'

export const repoColumns = {
  id: repos.id,
  name: repos.name,
  owner: repos.owner,
  localPath: repos.localPath,
  accessKind: repos.accessKind,
  wslDistro: repos.wslDistro,
  wslPath: repos.wslPath,
  githubUrl: repos.githubUrl,
  defaultBranch: repos.defaultBranch,
  githubLabels: repos.githubLabels,
  githubLabelsSyncedAt: repos.githubLabelsSyncedAt,
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
    accessKind?: RepoAccessKind
    wslDistro?: string | null
    wslPath?: string | null
    githubUrl: string | null
    defaultBranch: string | null
    githubLabels?: GitHubLabel[]
    githubLabelsSyncedAt?: string | null
  }
): Repo {
  const now = new Date().toISOString()
  const id = uuidv4()
  const githubLabels = input.githubLabels ?? []
  const githubLabelsSyncedAt = input.githubLabelsSyncedAt ?? null
  const accessKind = input.accessKind ?? 'host'
  const wslDistro = accessKind === 'wsl' ? (input.wslDistro ?? null) : null
  const wslPath = accessKind === 'wsl' ? (input.wslPath ?? null) : null

  db.insert(repos)
    .values({
      id,
      name: input.name,
      owner: input.owner,
      localPath: input.localPath,
      accessKind,
      wslDistro: wslDistro ?? undefined,
      wslPath: wslPath ?? undefined,
      githubUrl: input.githubUrl ?? undefined,
      defaultBranch: input.defaultBranch ?? undefined,
      githubLabels: JSON.stringify(githubLabels),
      githubLabelsSyncedAt: githubLabelsSyncedAt ?? undefined,
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
    accessKind,
    wslDistro,
    wslPath,
    githubUrl: input.githubUrl,
    defaultBranch: input.defaultBranch,
    githubLabels,
    githubLabelsSyncedAt,
    ...DEFAULT_REPO_AUTO_PUBLISH_SETTINGS,
    createdAt: now,
    updatedAt: now
  }
}

export function listRepos(db: PilogDatabase): Repo[] {
  return db.select(repoColumns).from(repos).all().map(mapRepoRow)
}

export function getRepoById(db: PilogDatabase, id: string): Repo | null {
  const row = db.select(repoColumns).from(repos).where(eq(repos.id, id)).get()
  return row ? mapRepoRow(row) : null
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

export function updateRepoGithubLabels(
  db: PilogDatabase,
  id: string,
  input: { githubLabels: GitHubLabel[]; githubLabelsSyncedAt?: string }
): Repo | null {
  const now = new Date().toISOString()
  db.update(repos)
    .set({
      githubLabels: JSON.stringify(input.githubLabels),
      githubLabelsSyncedAt: input.githubLabelsSyncedAt ?? now,
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

export type RepoRow = {
  id: string
  name: string
  owner: string
  localPath: string
  accessKind: RepoAccessKind
  wslDistro: string | null
  wslPath: string | null
  githubUrl: string | null
  defaultBranch: string | null
  githubLabels: string
  githubLabelsSyncedAt: string | null
  autoPublishEnabled: boolean
  autoPublishMaxIssuesPerRun: number
  autoPublishDefaultLabel: string
  autoPublishDryRun: boolean
  autoPublishRequireConfirmation: boolean
  createdAt: string
  updatedAt: string
}

export function mapRepoRow(row: RepoRow): Repo {
  return {
    ...row,
    githubLabels: parseGithubLabels(row.githubLabels),
    githubLabelsSyncedAt: row.githubLabelsSyncedAt ?? null
  }
}

function parseGithubLabels(value: string): GitHubLabel[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((label) => {
      if (!label || typeof label !== 'object') return []
      const candidate = label as Partial<GitHubLabel>
      if (
        typeof candidate.id !== 'number' ||
        typeof candidate.name !== 'string' ||
        typeof candidate.color !== 'string'
      ) {
        return []
      }
      return [
        {
          id: candidate.id,
          name: candidate.name,
          color: candidate.color,
          description:
            typeof candidate.description === 'string' || candidate.description === null
              ? candidate.description
              : null
        }
      ]
    })
  } catch {
    return []
  }
}
