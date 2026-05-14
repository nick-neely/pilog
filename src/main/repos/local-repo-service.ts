import {
  isGitRepo,
  readLocalGitMetadata,
  parseGitHubOwnerRepo,
  parseRepoAccessDescriptor,
  readGitMetadataResult,
  type LocalGitMetadata
} from './git'
import { getOctokitClient, listLabels, listRepos } from '../github/client'
import { createRepo, getRepoById } from '../db/repositories/repos'
import { upsertRepoIndex } from '../db/repositories/repo-indices'
import type { PilogDatabase } from '../db/client'
import type {
  DetectLocalRepoResult,
  LinkRepoRequest,
  Repo,
  RepoAccessDescriptor,
  RepoAccessKind
} from '@shared/ipc'
import type { GitHubLabel } from '@shared/ipc'
import {
  REPO_LINK_RUNTIME_REQUIREMENTS,
  getBlockingRuntimeReadinessMessage,
  getRuntimeReadiness
} from '../runtime-readiness'
import { createRepoIndexSnapshot, REPO_INDEX_VERSION } from './repo-indexer'

export async function detectLocalRepo(localPath: string): Promise<DetectLocalRepoResult> {
  const access = parseRepoAccessDescriptor(localPath)
  const readiness = await getRuntimeReadiness()
  const message = getBlockingRuntimeReadinessMessage(readiness, REPO_LINK_RUNTIME_REQUIREMENTS)
  if (message) {
    return {
      state: 'runtime-blocked',
      message,
      recoveryAction: 'Open Settings and follow the runtime readiness recovery action.'
    }
  }

  if (!getOctokitClient()) {
    return { state: 'unauthenticated' }
  }

  let metadata: LocalGitMetadata | null
  if (access.kind === 'wsl') {
    const result = await readGitMetadataResult(access)
    if (result.state === 'wsl-failure') return result
    metadata = result.state === 'metadata' ? result.metadata : null
  } else {
    const gitRepo = await isGitRepo(access.displayPath)
    if (!gitRepo) return { state: 'not-git' }
    metadata = await readLocalGitMetadata(access.displayPath)
  }
  if (!metadata) return { state: 'no-remote' }

  const parsed = parseGitHubOwnerRepo(metadata.remoteUrl)
  if (!parsed) {
    return unmatchedRepoResult(access, metadata.remoteUrl)
  }

  const githubRepos = await listRepos()
  const matched = githubRepos.find(
    (r) =>
      r.owner.toLowerCase() === parsed.owner.toLowerCase() &&
      r.name.toLowerCase() === parsed.name.toLowerCase()
  )

  if (!matched) {
    return unmatchedRepoResult(access, metadata.remoteUrl)
  }

  return {
    state: 'matched',
    remoteUrl: metadata.remoteUrl,
    defaultBranch: metadata.defaultBranch,
    headSha: metadata.headSha,
    githubRepo: matched,
    access
  }
}

function unmatchedRepoResult(
  access: RepoAccessDescriptor,
  remoteUrl: string
): Extract<DetectLocalRepoResult, { state: 'unmatched' | 'wsl-failure' }> {
  if (access.kind === 'wsl') {
    return { state: 'wsl-failure', reason: 'unmatched', access, remoteUrl }
  }
  return { state: 'unmatched', remoteUrl }
}

export async function linkRepo(db: PilogDatabase, request: LinkRepoRequest): Promise<Repo> {
  const readiness = await getRuntimeReadiness()
  const message = getBlockingRuntimeReadinessMessage(readiness, REPO_LINK_RUNTIME_REQUIREMENTS)
  if (message) throw new Error(message)

  const labelCache = await fetchInitialLabelCache(request.githubRepo.owner, request.githubRepo.name)
  const accessFields = getRepoAccessFields(request.access)

  const repo = createRepo(db, {
    name: request.githubRepo.name,
    owner: request.githubRepo.owner,
    localPath: request.localPath,
    ...accessFields,
    githubUrl: request.githubRepo.url,
    defaultBranch: request.defaultBranch,
    githubLabels: labelCache.labels,
    githubLabelsSyncedAt: labelCache.syncedAt
  })

  try {
    const snapshot = await createRepoIndexSnapshot(request.access?.displayPath ?? request.localPath)
    const repoIndex = upsertRepoIndex(db, repo.id, { status: 'ready', ...snapshot })
    return { ...repo, repoIndex }
  } catch (err) {
    const repoIndex = upsertRepoIndex(db, repo.id, {
      status: 'failed',
      indexVersion: REPO_INDEX_VERSION,
      errorMessage: err instanceof Error ? err.message : 'Repo Index creation failed.'
    })
    return { ...repo, repoIndex }
  }
}

export async function refreshRepoIndex(db: PilogDatabase, repoId: string): Promise<Repo | null> {
  const repo = getRepoById(db, repoId)
  if (!repo || !repo.repoIndex) return repo

  try {
    const snapshot = await createRepoIndexSnapshot(repo.localPath)
    const repoIndex = upsertRepoIndex(db, repo.id, { status: 'ready', ...snapshot })
    return { ...repo, repoIndex }
  } catch (err) {
    const repoIndex = upsertRepoIndex(db, repo.id, {
      status: 'failed',
      indexVersion: repo.repoIndex.indexVersion,
      errorMessage: err instanceof Error ? err.message : 'Repo Index refresh failed.'
    })
    return { ...repo, repoIndex }
  }
}

async function fetchInitialLabelCache(
  owner: string,
  repo: string
): Promise<{ labels: GitHubLabel[]; syncedAt: string | null }> {
  if (!getOctokitClient()) return { labels: [], syncedAt: null }

  try {
    return {
      labels: await listLabels(owner, repo),
      syncedAt: new Date().toISOString()
    }
  } catch {
    return { labels: [], syncedAt: null }
  }
}

function getRepoAccessFields(access: LinkRepoRequest['access']): {
  accessKind: RepoAccessKind
  wslDistro: string | null
  wslPath: string | null
} {
  if (access?.kind !== 'wsl') {
    return {
      accessKind: 'host',
      wslDistro: null,
      wslPath: null
    }
  }

  return {
    accessKind: access.kind,
    wslDistro: access.distro,
    wslPath: access.linuxPath
  }
}
