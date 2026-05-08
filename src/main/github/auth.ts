import { shell } from 'electron'
import { createServer, type Server } from 'node:http'
import { randomBytes } from 'node:crypto'
import { setSecret, deleteSecret, getSecret } from '../security/secrets'

const SCOPES = 'repo'
const SECRET_KEY_TOKEN = 'github_token'
const SECRET_KEY_LOGIN = 'github_login'
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000

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

  return data.access_token!
}

async function fetchLogin(token: string): Promise<string> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  })
  const data = (await response.json()) as { login: string }
  return data.login
}

export type GitHubStatus = { connected: boolean; login?: string }

export async function startOAuthFlow(
  clientId: string,
  clientSecret: string
): Promise<GitHubStatus> {
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
            '<p>You can close this tab and return to PiLog.</p>' +
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
