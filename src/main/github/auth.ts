import { shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { setSecret, deleteSecret, getSecret } from '../security/secrets'
import type { GitHubAuthProgress, GitHubStatus } from '@shared/ipc'

const SCOPES = 'repo'
const SECRET_KEY_TOKEN = 'github_token'
const SECRET_KEY_LOGIN = 'github_login'
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000
const DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

type FetchLike = typeof fetch
type Delay = (ms: number) => Promise<void>

export class GitHubDeviceFlowError extends Error {
  constructor(
    public readonly state:
      | 'denied'
      | 'expired'
      | 'cancelled'
      | 'network_error'
      | 'authorization_pending'
      | 'slow_down',
    message: string
  ) {
    super(message)
    this.name = 'GitHubDeviceFlowError'
  }
}

type DeviceCodeResponse = {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export type GitHubAuthRuntimeOptions = {
  clientId: string
  clientSecret: string
  authFlow: 'device' | 'loopback'
}

export function resolveGitHubAuthOptions(input: {
  env: NodeJS.ProcessEnv
  isDev: boolean
  bundledClientId: string
}): GitHubAuthRuntimeOptions {
  const clientSecret = input.env.GITHUB_CLIENT_SECRET?.trim() ?? ''

  return {
    clientId: input.env.GITHUB_CLIENT_ID?.trim() || input.bundledClientId.trim(),
    clientSecret,
    authFlow:
      input.isDev && input.env.PILOG_GITHUB_AUTH_FLOW === 'loopback' && Boolean(clientSecret)
        ? 'loopback'
        : 'device'
  }
}

type CallbackResult =
  | { code: string }
  | { error: 'state_mismatch' | 'missing_code' | 'wrong_path' | string }

export function parseOAuthCallback(urlPath: string, expectedState: string): CallbackResult {
  const url = new URL(urlPath, 'http://localhost')

  if (url.pathname !== '/callback') {
    return { error: 'wrong_path' }
  }

  const error = url.searchParams.get('error')
  if (error) {
    return { error }
  }

  const state = url.searchParams.get('state')
  if (state !== expectedState) {
    return { error: 'state_mismatch' }
  }

  const code = url.searchParams.get('code')
  if (!code) {
    return { error: 'missing_code' }
  }

  return { code }
}

export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code
    })
  })

  const data = (await response.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }

  if (data.error) {
    throw new Error(data.error_description || data.error)
  }

  if (!data.access_token) {
    throw new Error('GitHub did not return an access token')
  }

  return data.access_token
}

export async function requestDeviceCode(
  clientId: string,
  options: { fetchImpl?: FetchLike } = {}
): Promise<DeviceCodeResponse> {
  if (!clientId.trim()) {
    throw new Error('GitHub device auth is not configured. A public GitHub client ID is required.')
  }

  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: SCOPES
      })
    })
  } catch (err) {
    throw new GitHubDeviceFlowError('network_error', getErrorMessage(err))
  }

  const data = (await response.json()) as {
    device_code?: string
    user_code?: string
    verification_uri?: string
    expires_in?: number
    interval?: number
    error?: string
    error_description?: string
  }

  if (data.error) {
    throw new GitHubDeviceFlowError('network_error', data.error_description || data.error)
  }

  if (!data.device_code || !data.user_code || !data.verification_uri || !data.expires_in) {
    throw new GitHubDeviceFlowError('network_error', 'GitHub did not return a device code.')
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval ?? 5
  }
}

export async function exchangeDeviceCodeForToken(
  deviceCode: string,
  clientId: string,
  options: { fetchImpl?: FetchLike } = {}
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: DEVICE_GRANT_TYPE
      })
    })
  } catch (err) {
    throw new GitHubDeviceFlowError('network_error', getErrorMessage(err))
  }

  const data = (await response.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }

  if (data.access_token) return data.access_token

  switch (data.error) {
    case 'authorization_pending':
      throw new GitHubDeviceFlowError('authorization_pending', 'Waiting for GitHub authorization.')
    case 'slow_down':
      throw new GitHubDeviceFlowError('slow_down', 'GitHub asked Pilog to poll more slowly.')
    case 'access_denied':
      throw new GitHubDeviceFlowError('denied', 'GitHub authorization was denied.')
    case 'expired_token':
      throw new GitHubDeviceFlowError('expired', 'The GitHub device code expired.')
    default:
      throw new GitHubDeviceFlowError(
        'network_error',
        data.error_description || data.error || 'GitHub did not return an access token.'
      )
  }
}

export async function startDeviceFlow(
  clientId: string,
  options: {
    fetchImpl?: FetchLike
    delay?: Delay
    now?: () => Date
    onProgress?: (event: GitHubAuthProgress) => void
    signal?: AbortSignal
    openExternal?: (url: string) => Promise<unknown>
  } = {}
): Promise<GitHubStatus> {
  const fetchImpl = options.fetchImpl ?? fetch
  const delay = options.delay ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const now = options.now ?? (() => new Date())
  const device = await requestDeviceCode(clientId, { fetchImpl })
  let intervalSeconds = device.interval
  const expiresAtMs = now().getTime() + device.expiresIn * 1000

  const deviceProgress: GitHubAuthProgress = {
    state: 'device_code',
    userCode: device.userCode,
    verificationUri: device.verificationUri,
    expiresAt: new Date(expiresAtMs).toISOString(),
    intervalSeconds
  }
  options.onProgress?.(deviceProgress)
  await (options.openExternal ?? shell.openExternal)(device.verificationUri)

  while (now().getTime() < expiresAtMs) {
    if (options.signal?.aborted) {
      const event: GitHubAuthProgress = {
        state: 'cancelled',
        message: 'GitHub authorization was cancelled.'
      }
      options.onProgress?.(event)
      throw new GitHubDeviceFlowError('cancelled', event.message)
    }

    options.onProgress?.({ state: 'polling', message: 'Waiting for GitHub authorization.' })

    try {
      const token = await exchangeDeviceCodeForToken(device.deviceCode, clientId, { fetchImpl })
      const login = await fetchLogin(token, fetchImpl)

      setSecret(SECRET_KEY_TOKEN, token)
      setSecret(SECRET_KEY_LOGIN, login)

      const event: GitHubAuthProgress = { state: 'authorized', login }
      options.onProgress?.(event)
      return { connected: true, login, auth: event }
    } catch (err) {
      if (!(err instanceof GitHubDeviceFlowError)) {
        const deviceError = new GitHubDeviceFlowError('network_error', getErrorMessage(err))
        options.onProgress?.(errorToProgress(deviceError))
        throw deviceError
      }

      if (err.state === 'authorization_pending') {
        await waitBeforeNextPoll(intervalSeconds * 1000, delay, options.signal)
        continue
      }

      if (err.state === 'slow_down') {
        intervalSeconds += 5
        options.onProgress?.({
          state: 'slow_down',
          intervalSeconds,
          message: 'GitHub asked Pilog to wait a little longer before checking again.'
        })
        await waitBeforeNextPoll(intervalSeconds * 1000, delay, options.signal)
        continue
      }

      const event = errorToProgress(err)
      options.onProgress?.(event)
      throw err
    }
  }

  const event: GitHubAuthProgress = {
    state: 'expired',
    message: 'The GitHub device code expired. Start a new connection to try again.'
  }
  options.onProgress?.(event)
  throw new GitHubDeviceFlowError('expired', event.message)
}

async function fetchLogin(token: string, fetchImpl: FetchLike = fetch): Promise<string> {
  let response: Response
  try {
    response = await fetchImpl('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      }
    })
  } catch (err) {
    throw new GitHubDeviceFlowError('network_error', getErrorMessage(err))
  }

  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`)
  }

  const data = (await response.json()) as { login?: string }
  if (!data.login) {
    throw new Error('GitHub API did not return a login')
  }
  return data.login
}

export async function startOAuthFlow(
  clientId: string,
  clientSecret: string
): Promise<GitHubStatus> {
  if (!clientId.trim() || !clientSecret.trim()) {
    throw new Error(
      'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env.'
    )
  }

  const state = randomBytes(16).toString('hex')

  return new Promise<GitHubStatus>((resolve, reject) => {
    let settled = false

    const server: Server = createServer(async (req, res) => {
      const result = parseOAuthCallback(req.url!, state)

      if ('error' in result) {
        res.writeHead(400, { 'Content-Type': 'text/plain' })
        res.end(`Authorization failed: ${result.error}`)
        if (!settled) {
          settled = true
          server.close()
          reject(new Error(`OAuth callback error: ${result.error}`))
        }
        return
      }

      try {
        const token = await exchangeCodeForToken(result.code, clientId, clientSecret)
        const login = await fetchLogin(token)

        setSecret(SECRET_KEY_TOKEN, token)
        setSecret(SECRET_KEY_LOGIN, login)

        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(
          '<html><body style="font-family:system-ui;text-align:center;padding:4rem">' +
            '<h1>Connected to GitHub</h1>' +
            '<p>You can close this tab and return to Pilog.</p>' +
            '</body></html>'
        )

        if (!settled) {
          settled = true
          server.close()
          resolve({ connected: true, login })
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Token exchange failed')
        if (!settled) {
          settled = true
          server.close()
          reject(err)
        }
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind loopback server'))
        return
      }

      const redirectUri = `http://127.0.0.1:${addr.port}/callback`
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: SCOPES,
        state
      })

      shell.openExternal(`https://github.com/login/oauth/authorize?${params}`)
    })

    setTimeout(() => {
      if (!settled) {
        settled = true
        server.close()
        reject(new Error('OAuth flow timed out'))
      }
    }, OAUTH_TIMEOUT_MS)
  })
}

export function signOut(): void {
  deleteSecret(SECRET_KEY_TOKEN)
  deleteSecret(SECRET_KEY_LOGIN)
}

export function getStoredToken(): string | null {
  return getSecret(SECRET_KEY_TOKEN)
}

export function getGitHubStatus(): GitHubStatus {
  const token = getSecret(SECRET_KEY_TOKEN)
  if (!token) return { connected: false }
  const login = getSecret(SECRET_KEY_LOGIN)
  return { connected: true, login: login ?? undefined }
}

function errorToProgress(error: GitHubDeviceFlowError): GitHubAuthProgress {
  switch (error.state) {
    case 'denied':
      return { state: 'denied', message: 'GitHub authorization was denied.' }
    case 'expired':
      return {
        state: 'expired',
        message: 'The GitHub device code expired. Start a new connection to try again.'
      }
    case 'cancelled':
      return { state: 'cancelled', message: 'GitHub authorization was cancelled.' }
    case 'network_error':
      return { state: 'network_error', message: error.message }
    default:
      return { state: 'network_error', message: error.message }
  }
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function waitBeforeNextPoll(ms: number, delay: Delay, signal: AbortSignal | undefined) {
  if (!signal) {
    await delay(ms)
    return
  }

  if (signal.aborted) return

  await Promise.race([
    delay(ms),
    new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    })
  ])
}
