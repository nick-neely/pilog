import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  AuthStorage,
  AuthStorageBackend,
  ModelRegistry
} from '@earendil-works/pi-coding-agent'

type LockResult<T> = { result: T; next?: string }
type PiCodingAgentModule = typeof import('@earendil-works/pi-coding-agent')

let piCodingAgentModule: Promise<PiCodingAgentModule> | null = null

export class SafeStorageAuthStorageBackend implements AuthStorageBackend {
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

async function loadPiCodingAgent(): Promise<PiCodingAgentModule> {
  piCodingAgentModule ??= import('@earendil-works/pi-coding-agent')
  return piCodingAgentModule
}

export async function createSafeStorageAuthStorage(): Promise<AuthStorage> {
  const { AuthStorage } = await loadPiCodingAgent()
  return AuthStorage.fromStorage(new SafeStorageAuthStorageBackend())
}

export async function createModelRegistry(authStorage?: AuthStorage): Promise<ModelRegistry> {
  const { ModelRegistry } = await loadPiCodingAgent()
  return ModelRegistry.inMemory(authStorage ?? (await createSafeStorageAuthStorage()))
}

export function clearSafeStorageAuthStorage(): void {
  const dir = join(app.getPath('userData'), 'pi-auth')
  rmSync(dir, { recursive: true, force: true })
}

export async function importAuthJsonIntoSafeStorage(authJsonPath: string): Promise<string[]> {
  if (!existsSync(authJsonPath)) return []

  const parsed = parseAuthJson(readFileSync(authJsonPath, 'utf-8'))
  if (!parsed) return []

  const authStorage = await createSafeStorageAuthStorage()
  const imported: string[] = []

  for (const [provider, credential] of Object.entries(parsed)) {
    if (!isAuthCredential(credential)) continue
    authStorage.set(provider, credential)
    imported.push(provider)
  }

  return imported
}

function parseAuthJson(contents: string): Record<string, unknown> | null {
  const parsed = JSON.parse(contents) as unknown
  return isObjectLike(parsed) ? (parsed as Record<string, unknown>) : null
}

function isAuthCredential(value: unknown): value is Parameters<AuthStorage['set']>[1] {
  if (!value || typeof value !== 'object') return false
  const credential = value as { type?: unknown; key?: unknown }
  if (credential.type === 'api_key') return typeof credential.key === 'string'
  if (credential.type === 'oauth') return true
  return false
}

function isObjectLike(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object'
}
