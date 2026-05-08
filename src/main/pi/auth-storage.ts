import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

type LockResult<T> = { result: T; next?: string }
type StoredCredential = { type: 'api_key'; key: string } | { type: 'oauth'; [key: string]: unknown }
type StoredAuth = Record<string, StoredCredential>
type AuthStatus = { configured: boolean; source?: 'storage' }

export class SafeStorageAuthStorageBackend {
  constructor(private readonly dir = join(app.getPath('userData'), 'pi-auth')) {}

  withLock<T>(fn: (current: string | undefined) => LockResult<T>): T {
    const result = fn(this.readAll())
    if (result.next !== undefined) this.writeAll(result.next)
    return result.result
  }

  async withLockAsync<T>(fn: (current: string | undefined) => Promise<LockResult<T>>): Promise<T> {
    const result = await fn(this.readAll())
    if (result.next !== undefined) this.writeAll(result.next)
    return result.result
  }

  private readAll(): string | undefined {
    if (!existsSync(this.dir)) return undefined

    const data: Record<string, unknown> = {}
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.bin')) continue
      const provider = basename(entry.name, '.bin')
      const encrypted = readFileSync(join(this.dir, entry.name))
      const decrypted = safeStorage.decryptString(encrypted)
      data[provider] = JSON.parse(decrypted)
    }

    return Object.keys(data).length > 0 ? JSON.stringify(data) : undefined
  }

  private writeAll(next: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage encryption is unavailable.')
    }

    const parsed = JSON.parse(next) as Record<string, unknown>
    mkdirSync(this.dir, { recursive: true })

    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.bin')) rmSync(join(this.dir, entry.name))
    }

    for (const [provider, credential] of Object.entries(parsed)) {
      const encrypted = safeStorage.encryptString(JSON.stringify(credential))
      writeFileSync(join(this.dir, `${provider}.bin`), encrypted)
    }
  }
}

export class SafeStorageAuthStorage {
  constructor(private readonly backend = new SafeStorageAuthStorageBackend()) {}

  set(provider: string, credential: StoredCredential): void {
    this.backend.withLock((current) => {
      const parsed = parseStoredAuth(current)
      parsed[provider] = credential
      return { result: undefined, next: JSON.stringify(parsed) }
    })
  }

  get(provider: string): StoredCredential | undefined {
    return this.backend.withLock((current) => ({ result: parseStoredAuth(current)[provider] }))
  }

  hasAuth(provider: string): boolean {
    return this.get(provider) !== undefined
  }

  getAuthStatus(provider: string): AuthStatus {
    return this.hasAuth(provider) ? { configured: true, source: 'storage' } : { configured: false }
  }

  getOAuthProviders(): unknown[] {
    return []
  }

  async getApiKey(provider: string): Promise<string | undefined> {
    const credential = this.get(provider)
    return credential?.type === 'api_key' ? credential.key : undefined
  }
}

export function createSafeStorageAuthStorage(): SafeStorageAuthStorage {
  return new SafeStorageAuthStorage()
}

export function createModelRegistry(authStorage = createSafeStorageAuthStorage()): {
  find: (_provider: string, _modelId: string) => undefined
  getApiKeyAndHeaders: (model: {
    provider: string
  }) => Promise<
    { ok: true; apiKey?: string; headers?: Record<string, string> } | { ok: false; error: string }
  >
} {
  return {
    find: () => undefined,
    getApiKeyAndHeaders: async (model) => {
      const apiKey = await authStorage.getApiKey(model.provider)
      return apiKey
        ? { ok: true, apiKey }
        : { ok: false, error: `No API key found for "${model.provider}"` }
    }
  }
}

function parseStoredAuth(current: string | undefined): StoredAuth {
  if (!current) return {}
  const parsed = JSON.parse(current) as unknown
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as StoredAuth)
    : {}
}
