import { Octokit } from '@octokit/rest'
import { getStoredToken } from './auth'
import type { GitHubRepo } from '@shared/ipc'

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
    for (const repo of response.data) {
      repos.push({
        id: repo.id,
        name: repo.name,
        owner: repo.owner.login,
        fullName: repo.full_name,
        url: repo.html_url,
        defaultBranch: repo.default_branch
      })
    }
  }

  cachedRepos = repos
  return repos
}
