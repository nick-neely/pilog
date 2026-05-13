import {
  isGitRepo,
  readLocalGitMetadata,
  parseGitHubOwnerRepo,
  parseRepoAccessDescriptor,
  readGitMetadata,
  type LocalGitMetadata
} from './git'
import { getOctokitClient, listLabels, listRepos } from '../github/client'
import { createRepo } from '../db/repositories/repos'
import type { PilogDatabase } from '../db/client'
import type { DetectLocalRepoResult, LinkRepoRequest, Repo, RepoAccessKind } from '@shared/ipc'
import type { GitHubLabel } from '@shared/ipc'
import {
  REPO_LINK_RUNTIME_REQUIREMENTS,
  getBlockingRuntimeReadinessMessage,
  getRuntimeReadiness
} from '../runtime-readiness'

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
    metadata = await readGitMetadata(access)
  } else {
    const gitRepo = await isGitRepo(access.displayPath)
    if (!gitRepo) return { state: 'not-git' }
    metadata = await readLocalGitMetadata(access.displayPath)
  }
  if (!metadata) return { state: 'no-remote' }

  const parsed = parseGitHubOwnerRepo(metadata.remoteUrl)
  if (!parsed) return { state: 'unmatched', remoteUrl: metadata.remoteUrl }

  const githubRepos = await listRepos()
  const matched = githubRepos.find(
    (r) =>
      r.owner.toLowerCase() === parsed.owner.toLowerCase() &&
      r.name.toLowerCase() === parsed.name.toLowerCase()
  )

  if (!matched) return { state: 'unmatched', remoteUrl: metadata.remoteUrl }

  return {
    state: 'matched',
    remoteUrl: metadata.remoteUrl,
    defaultBranch: metadata.defaultBranch,
    headSha: metadata.headSha,
    githubRepo: matched,
    access
  }
}

export async function linkRepo(db: PilogDatabase, request: LinkRepoRequest): Promise<Repo> {
  const readiness = await getRuntimeReadiness()
  const message = getBlockingRuntimeReadinessMessage(readiness, REPO_LINK_RUNTIME_REQUIREMENTS)
  if (message) throw new Error(message)

  const labelCache = await fetchInitialLabelCache(request.githubRepo.owner, request.githubRepo.name)
  const accessFields = getRepoAccessFields(request.access)

  return createRepo(db, {
    name: request.githubRepo.name,
    owner: request.githubRepo.owner,
    localPath: request.localPath,
    ...accessFields,
    githubUrl: request.githubRepo.url,
    defaultBranch: request.defaultBranch,
    githubLabels: labelCache.labels,
    githubLabelsSyncedAt: labelCache.syncedAt
  })
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
