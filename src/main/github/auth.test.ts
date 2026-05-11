import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync } from 'node:fs'

const { userDataPath } = vi.hoisted(() => ({ userDataPath: '/tmp/pilog-auth-test' }))

vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`encrypted:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().slice('encrypted:'.length)
  },
  app: { getPath: vi.fn().mockReturnValue(userDataPath), isPackaged: false }
}))

import {
  GitHubDeviceFlowError,
  exchangeDeviceCodeForToken,
  parseOAuthCallback,
  requestDeviceCode,
  resolveGitHubAuthOptions,
  startDeviceFlow,
  startOAuthFlow
} from './auth'

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

describe('resolveGitHubAuthOptions', () => {
  it('uses device flow by default with a bundled public client id and no secret', () => {
    expect(
      resolveGitHubAuthOptions({
        env: {},
        isDev: false,
        bundledClientId: 'bundled-client'
      })
    ).toEqual({
      clientId: 'bundled-client',
      clientSecret: '',
      authFlow: 'device'
    })
  })

  it('only enables loopback in development when explicitly requested with a secret', () => {
    expect(
      resolveGitHubAuthOptions({
        env: {
          GITHUB_CLIENT_ID: 'dev-client',
          GITHUB_CLIENT_SECRET: 'dev-secret',
          PILOG_GITHUB_AUTH_FLOW: 'loopback'
        },
        isDev: true,
        bundledClientId: 'bundled-client'
      })
    ).toEqual({
      clientId: 'dev-client',
      clientSecret: 'dev-secret',
      authFlow: 'loopback'
    })

    expect(
      resolveGitHubAuthOptions({
        env: { GITHUB_CLIENT_ID: 'dev-client', PILOG_GITHUB_AUTH_FLOW: 'loopback' },
        isDev: true,
        bundledClientId: 'bundled-client'
      }).authFlow
    ).toBe('device')
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

describe('GitHub device flow', () => {
  const clientId = 'public-client-id'
  const deviceResponse = {
    device_code: 'device-123',
    user_code: 'ABCD-1234',
    verification_uri: 'https://github.com/login/device',
    expires_in: 900,
    interval: 5
  }

  beforeEach(() => {
    rmSync(userDataPath, { recursive: true, force: true })
    mkdirSync(userDataPath, { recursive: true })
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests a device code with a public client id and no client secret', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => deviceResponse
    } as Response)

    const result = await requestDeviceCode(clientId)

    expect(result.userCode).toBe('ABCD-1234')
    expect(fetch).toHaveBeenCalledWith(
      'https://github.com/login/device/code',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Accept: 'application/json' })
      })
    )
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body).toEqual({ client_id: clientId, scope: 'repo' })
  })

  it('exchanges a device code without a client secret', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'gho_device', token_type: 'bearer', scope: 'repo' })
    } as Response)

    const token = await exchangeDeviceCodeForToken('device-123', clientId)

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body).toMatchObject({
      client_id: clientId,
      device_code: 'device-123',
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
    expect(body.client_secret).toBeUndefined()
    expect(token).toBe('gho_device')
  })

  it('polls through pending and slow_down before storing the connected login', async () => {
    const progress: string[] = []
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => deviceResponse } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'authorization_pending' })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ error: 'slow_down' })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'gho_device' })
      } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ login: 'octo' }) } as Response)

    const result = await startDeviceFlow(clientId, {
      delay: async () => undefined,
      onProgress: (event) => progress.push(event.state),
      now: () => new Date('2026-05-11T00:00:00.000Z')
    })

    expect(result).toEqual({
      connected: true,
      login: 'octo',
      auth: { state: 'authorized', login: 'octo' }
    })
    expect(progress).toEqual([
      'device_code',
      'polling',
      'polling',
      'slow_down',
      'polling',
      'authorized'
    ])
  })

  it('reports denied and expired device flow states', async () => {
    await expect(
      exchangeDeviceCodeForToken('device-123', clientId, {
        fetchImpl: async () =>
          ({
            ok: true,
            json: async () => ({ error: 'access_denied' })
          }) as Response
      })
    ).rejects.toMatchObject(new GitHubDeviceFlowError('denied', 'GitHub authorization was denied.'))

    await expect(
      exchangeDeviceCodeForToken('device-123', clientId, {
        fetchImpl: async () =>
          ({
            ok: true,
            json: async () => ({ error: 'expired_token' })
          }) as Response
      })
    ).rejects.toMatchObject(new GitHubDeviceFlowError('expired', 'The GitHub device code expired.'))
  })

  it('classifies network failures while polling', async () => {
    await expect(
      exchangeDeviceCodeForToken('device-123', clientId, {
        fetchImpl: async () => {
          throw new Error('offline')
        }
      })
    ).rejects.toMatchObject(new GitHubDeviceFlowError('network_error', 'offline'))
  })

  it('reports cancellation before polling the device token', async () => {
    const controller = new AbortController()
    const progress: string[] = []
    controller.abort()
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => deviceResponse
    } as Response)

    await expect(
      startDeviceFlow(clientId, {
        signal: controller.signal,
        onProgress: (event) => progress.push(event.state),
        now: () => new Date('2026-05-11T00:00:00.000Z')
      })
    ).rejects.toMatchObject(
      new GitHubDeviceFlowError('cancelled', 'GitHub authorization was cancelled.')
    )

    expect(progress).toEqual(['device_code', 'cancelled'])
  })
})
