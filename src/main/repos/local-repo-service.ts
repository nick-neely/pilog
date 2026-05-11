import { isGitRepo, readLocalGitMetadata, parseGitHubOwnerRepo } from './git'
import { getOctokitClient, listLabels, listRepos } from '../github/client'
import { createRepo } from '../db/repositories/repos'
import type { PilogDatabase } from '../db/client'
import type { DetectLocalRepoResult, LinkRepoRequest, Repo } from '@shared/ipc'
import type { GitHubLabel } from '@shared/ipc'

export async function detectLocalRepo(localPath: string): Promise<DetectLocalRepoResult> {
  if (!getOctokitClient()) {
    return { state: 'unauthenticated' }
  }

  const gitRepo = await isGitRepo(localPath)
  if (!gitRepo) return { state: 'not-git' }

  const metadata = await readLocalGitMetadata(localPath)
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
    githubRepo: matched
  }
}

export async function linkRepo(db: PilogDatabase, request: LinkRepoRequest): Promise<Repo> {
  const labelCache = await fetchInitialLabelCache(request.githubRepo.owner, request.githubRepo.name)

  return createRepo(db, {
    name: request.githubRepo.name,
    owner: request.githubRepo.owner,
    localPath: request.localPath,
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
