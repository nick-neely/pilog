import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`encrypted:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().slice('encrypted:'.length)
  },
  app: { getPath: vi.fn().mockReturnValue('/tmp/pilog-client-test') }
}))

vi.mock('../security/secrets', () => {
  const store = new Map<string, string>()
  return {
    getSecret: (key: string) => store.get(key) ?? null,
    setSecret: (key: string, value: string) => store.set(key, value),
    deleteSecret: (key: string) => store.delete(key),
    __store: store
  }
})

vi.mock('@octokit/rest', () => {
  class MockOctokit {
    rest = {
      users: {
        getAuthenticated: vi.fn().mockResolvedValue({
          data: { login: 'testuser', avatar_url: 'https://avatars.githubusercontent.com/u/1' }
        })
      }
    }
  }
  return { Octokit: MockOctokit }
})

describe('github client', () => {
  let client: typeof import('./client')
  let secretsStore: Map<string, string>

  beforeEach(async () => {
    vi.resetModules()
    const secrets = await import('../security/secrets')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    secretsStore = (secrets as any).__store
    secretsStore.clear()
    client = await import('./client')
  })

  it('returns null client when no token is stored', () => {
    expect(client.getOctokitClient()).toBeNull()
  })

  it('returns an Octokit instance when a token is stored', () => {
    secretsStore.set('github_token', 'gho_abc')
    const octo = client.getOctokitClient()
    expect(octo).not.toBeNull()
  })

  it('memoises the client for the same token', () => {
    secretsStore.set('github_token', 'gho_abc')
    const first = client.getOctokitClient()
    const second = client.getOctokitClient()
    expect(first).toBe(second)
  })

  it('creates a new client when the token changes', () => {
    secretsStore.set('github_token', 'gho_abc')
    const first = client.getOctokitClient()
    secretsStore.set('github_token', 'gho_def')
    const second = client.getOctokitClient()
    expect(first).not.toBe(second)
  })

  it('clears the memoised client on reset', () => {
    secretsStore.set('github_token', 'gho_abc')
    const first = client.getOctokitClient()
    client.resetClient()
    const second = client.getOctokitClient()
    expect(first).not.toBe(second)
  })

  it('getAuthenticatedUser returns login from the API', async () => {
    secretsStore.set('github_token', 'gho_abc')
    const user = await client.getAuthenticatedUser()
    expect(user).toEqual({
      login: 'testuser',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1'
    })
  })

  it('getAuthenticatedUser returns null when not connected', async () => {
    const user = await client.getAuthenticatedUser()
    expect(user).toBeNull()
  })
})
