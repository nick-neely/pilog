import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let userDataDir: string

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) =>
      Buffer.from(`encrypted:${Buffer.from(text, 'utf-8').toString('base64')}`),
    decryptString: (buffer: Buffer) => {
      const value = buffer.toString()
      if (!value.startsWith('encrypted:')) throw new Error('Encrypted blob required')
      return Buffer.from(value.slice('encrypted:'.length), 'base64').toString('utf-8')
    }
  },
  app: {
    getPath: vi.fn(() => userDataDir)
  }
}))

describe('SafeStorageAuthStorage', () => {
  beforeEach(() => {
    userDataDir = join(tmpdir(), `pilog-pi-auth-test-${Date.now()}-${Math.random()}`)
    mkdirSync(userDataDir, { recursive: true })
    vi.resetModules()
  })

  it('round-trips provider API keys through safeStorage encrypted blobs', async () => {
    const { createSafeStorageAuthStorage } = await import('./auth-storage')
    const authStorage = await createSafeStorageAuthStorage()

    authStorage.set('openai', { type: 'api_key', key: 'sk-test-secret' })

    expect(authStorage.get('openai')).toEqual({ type: 'api_key', key: 'sk-test-secret' })
    await expect(authStorage.getApiKey('openai')).resolves.toBe('sk-test-secret')

    const authDir = join(userDataDir, 'pi-auth')
    const files = readdirSync(authDir)
    expect(files).toEqual(['openai.bin'])

    const raw = readFileSync(join(authDir, 'openai.bin'), 'utf-8')
    expect(raw).not.toContain('sk-test-secret')
    expect(raw).toContain('encrypted:')
  })

  it('clears only Pi auth blobs during reset', async () => {
    const { clearSafeStorageAuthStorage, createSafeStorageAuthStorage } =
      await import('./auth-storage')
    const authStorage = await createSafeStorageAuthStorage()
    authStorage.set('openai', { type: 'api_key', key: 'sk-test-secret' })

    clearSafeStorageAuthStorage()

    expect(existsSync(join(userDataDir, 'pi-auth'))).toBe(false)
  })
})
