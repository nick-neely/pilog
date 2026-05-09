import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`encrypted:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().slice('encrypted:'.length)
  },
  app: { getPath: vi.fn().mockReturnValue('/tmp/pilog-auth-test') }
}))

import { parseOAuthCallback, startOAuthFlow } from './auth'

describe('parseOAuthCallback', () => {
  it('extracts code and state from a valid callback URL', () => {
    const result = parseOAuthCallback('/callback?code=abc123&state=xyz789', 'xyz789')
    expect(result).toEqual({ code: 'abc123' })
  })

  it('returns an error when state does not match', () => {
    const result = parseOAuthCallback('/callback?code=abc123&state=wrong', 'expected')
    expect(result).toEqual({ error: 'state_mismatch' })
  })

  it('returns an error when code is missing', () => {
    const result = parseOAuthCallback('/callback?state=xyz789', 'xyz789')
    expect(result).toEqual({ error: 'missing_code' })
  })

  it('returns an error for non-callback paths', () => {
    const result = parseOAuthCallback('/other?code=abc&state=xyz', 'xyz')
    expect(result).toEqual({ error: 'wrong_path' })
  })

  it('handles a GitHub error callback', () => {
    const result = parseOAuthCallback(
      '/callback?error=access_denied&error_description=The+user+denied&state=xyz',
      'xyz'
    )
    expect(result).toEqual({ error: 'access_denied' })
  })
})

describe('startOAuthFlow', () => {
  it('fails before opening GitHub when OAuth credentials are missing', async () => {
    await expect(startOAuthFlow('', 'secret')).rejects.toThrow(
      'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.'
    )
  })
})

describe('exchangeCodeForToken', () => {
  let exchangeCodeForToken: typeof import('./auth').exchangeCodeForToken

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn())
    vi.resetModules()
    const mod = await import('./auth')
    exchangeCodeForToken = mod.exchangeCodeForToken
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends correct parameters and returns the access token', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'gho_token123', token_type: 'bearer', scope: 'repo' })
    } as Response)

    const token = await exchangeCodeForToken('authcode', 'client123', 'secret456')

    expect(fetch).toHaveBeenCalledWith(
      'https://github.com/login/oauth/access_token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Accept: 'application/json'
        })
      })
    )

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.client_id).toBe('client123')
    expect(body.client_secret).toBe('secret456')
    expect(body.code).toBe('authcode')

    expect(token).toBe('gho_token123')
  })

  it('throws on GitHub error response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        error: 'bad_verification_code',
        error_description: 'The code is invalid'
      })
    } as Response)

    await expect(exchangeCodeForToken('badcode', 'c', 's')).rejects.toThrow('The code is invalid')
  })
})
