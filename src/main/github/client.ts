import { Octokit } from '@octokit/rest'
import { getStoredToken } from './auth'
import type { GitHubRepo, GitHubLabel } from '@shared/ipc'
import { log } from '../lib/log'

let cachedClient: Octokit | null = null
let cachedToken: string | null = null
let cachedRepos: GitHubRepo[] | null = null

export function getOctokitClient(): Octokit | null {
  const token = getStoredToken()
  if (!token) return null

  if (cachedClient && cachedToken === token) {
    return cachedClient
  }

  cachedClient = new Octokit({ auth: token })
  cachedToken = token
  cachedRepos = null
  return cachedClient
}

export function resetClient(): void {
  cachedClient = null
  cachedToken = null
  cachedRepos = null
}

export async function getAuthenticatedUser(): Promise<{
  login: string
  avatarUrl: string
} | null> {
  const client = getOctokitClient()
  if (!client) return null

  const { data } = await client.rest.users.getAuthenticated()
  return {
    login: data.login,
    avatarUrl: data.avatar_url
  }
}

export async function listRepos(): Promise<GitHubRepo[]> {
  if (cachedRepos) return cachedRepos

  const client = getOctokitClient()
  if (!client) return []

  const repos: GitHubRepo[] = []
  for await (const response of client.paginate.iterator(
    client.rest.repos.listForAuthenticatedUser,
    { per_page: 100, affiliation: 'owner,collaborator,organization_member' }
  )) {
    repos.push(...response.data.map(mapGitHubRepo))
  }

  cachedRepos = repos
  return repos
}

export async function listLabels(owner: string, repo: string): Promise<GitHubLabel[]> {
  const client = getOctokitClient()
  if (!client) return []

  const labels: GitHubLabel[] = []
  for await (const response of client.paginate.iterator(client.rest.issues.listLabelsForRepo, {
    owner,
    repo,
    per_page: 100
  })) {
    labels.push(...response.data.map(mapGitHubLabel))
  }

  return labels
}

function mapGitHubRepo(repo: {
  id: number
  name: string
  owner: { login: string }
  full_name: string
  html_url: string
  default_branch: string
}): GitHubRepo {
  return {
    id: repo.id,
    name: repo.name,
    owner: repo.owner.login,
    fullName: repo.full_name,
    url: repo.html_url,
    defaultBranch: repo.default_branch
  }
}

function mapGitHubLabel(label: {
  id: number
  name: string
  color: string
  description?: string | null
}): GitHubLabel {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description ?? null
  }
}

export async function createIssue(
  owner: string,
  repo: string,
  payload: { title: string; body: string; labels?: string[] }
): Promise<{ url: string; number: number }> {
  const client = getOctokitClient()
  if (!client) throw new Error('Not authenticated')

  return withRetry(async () => {
    const { data } = await client.rest.issues.create({
      owner,
      repo,
      title: payload.title,
      body: payload.body,
      labels: payload.labels
    })
    return { url: data.html_url, number: data.number }
  })
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 100): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      const status = (err as { status?: number }).status

      if (status === 403 || status === 429) {
        const resetHeader = (err as { response?: { headers?: { 'x-ratelimit-reset'?: string } } })
          .response?.headers?.['x-ratelimit-reset']
        const resetAt = resetHeader ? new Date(Number(resetHeader) * 1000).toISOString() : 'unknown'
        log.warn(`GitHub rate limit hit; resets at ${resetAt}`)
        throw err
      }

      // Non-retryable client errors
      if (status && status >= 400 && status < 500) throw err

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)))
      }
    }
  }
  throw lastError
}
