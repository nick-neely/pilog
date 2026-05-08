import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  AuthStorage,
  ModelRegistry,
  type AuthStorageBackend
} from '@earendil-works/pi-coding-agent'

type LockResult<T> = { result: T; next?: string }

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

export function createSafeStorageAuthStorage(): AuthStorage {
  return AuthStorage.fromStorage(new SafeStorageAuthStorageBackend())
}

export function createModelRegistry(authStorage = createSafeStorageAuthStorage()): ModelRegistry {
  return ModelRegistry.inMemory(authStorage)
}
