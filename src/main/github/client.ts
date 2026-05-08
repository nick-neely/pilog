import { Octokit } from '@octokit/rest'
import { getStoredToken } from './auth'

let cachedClient: Octokit | null = null
let cachedToken: string | null = null

export function getOctokitClient(): Octokit | null {
  const token = getStoredToken()
  if (!token) return null

  if (cachedClient && cachedToken === token) {
    return cachedClient
  }

  cachedClient = new Octokit({ auth: token })
  cachedToken = token
  return cachedClient
}

export function resetClient(): void {
  cachedClient = null
  cachedToken = null
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
