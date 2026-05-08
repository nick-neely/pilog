import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let encryptionAvailable = true

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (text: string) => Buffer.from(`encrypted:${text}`),
    decryptString: (buffer: Buffer) => {
      const str = buffer.toString()
      if (!str.startsWith('encrypted:')) throw new Error('Invalid encrypted data')
      return str.slice('encrypted:'.length)
    }
  },
  app: {
    getPath: vi.fn()
  }
}))

let testDir: string
let secrets: typeof import('./secrets')

beforeEach(async () => {
  testDir = join(
    tmpdir(),
    `pilog-secrets-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  mkdirSync(testDir, { recursive: true })

  const electron = await import('electron')
  vi.mocked(electron.app.getPath).mockReturnValue(testDir)
  encryptionAvailable = true

  vi.resetModules()
  secrets = await import('./secrets')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('secrets', () => {
  it('returns null for a key that does not exist', () => {
    expect(secrets.getSecret('nonexistent')).toBeNull()
  })

  it('sets and retrieves a secret', () => {
    secrets.setSecret('github_token', 'gho_abc123')
    expect(secrets.getSecret('github_token')).toBe('gho_abc123')
  })

  it('overwrites an existing secret', () => {
    secrets.setSecret('github_token', 'gho_first')
    secrets.setSecret('github_token', 'gho_second')
    expect(secrets.getSecret('github_token')).toBe('gho_second')
  })

  it('deletes a secret', () => {
    secrets.setSecret('github_token', 'gho_abc123')
    secrets.deleteSecret('github_token')
    expect(secrets.getSecret('github_token')).toBeNull()
  })

  it('stores different keys independently', () => {
    secrets.setSecret('a', 'value_a')
    secrets.setSecret('b', 'value_b')
    expect(secrets.getSecret('a')).toBe('value_a')
    expect(secrets.getSecret('b')).toBe('value_b')
  })

  it('persists to a file in userData, not SQLite', () => {
    secrets.setSecret('github_token', 'gho_abc123')
    const secretsPath = join(testDir, 'secrets.json')
    expect(existsSync(secretsPath)).toBe(true)

    const raw = JSON.parse(readFileSync(secretsPath, 'utf-8'))
    expect(raw.github_token).toBeDefined()
    expect(raw.github_token).not.toContain('gho_abc123')
  })

  describe('when encryption is unavailable', () => {
    beforeEach(() => {
      encryptionAvailable = false
    })

    it('refuses to persist and logs a warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      secrets.setSecret('github_token', 'gho_abc123')

      expect(warnSpy).toHaveBeenCalled()
      const secretsPath = join(testDir, 'secrets.json')
      expect(existsSync(secretsPath)).toBe(false)
    })

    it('returns null on get', () => {
      expect(secrets.getSecret('github_token')).toBeNull()
    })
  })
})
