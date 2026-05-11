import { describe, expect, it, vi } from 'vitest'
import { getRuntimeReadiness } from './runtime-readiness'

describe('runtime readiness', () => {
  it('surfaces missing git with an end-user recovery action', async () => {
    const readiness = await getRuntimeReadiness({
      checkGitVersion: vi.fn(
        async (): Promise<{ ok: false; error: string }> => ({
          ok: false,
          error: 'spawn git ENOENT'
        })
      ),
      isSafeStorageAvailable: vi.fn(() => true),
      checkBundledRepoTooling: vi.fn(async () => ({ ok: true })),
      checkRepoAccess: vi.fn()
    })

    expect(readiness.ready).toBe(false)
    expect(readiness.items.git.status).toBe('missing')
    expect(readiness.items.git.recoveryAction).toContain('Install Git')
    expect(readiness.items.git.detail).not.toContain('ENOENT')
  })

  it('surfaces unavailable safeStorage as a keychain prerequisite', async () => {
    const readiness = await getRuntimeReadiness({
      checkGitVersion: vi.fn(async () => ({ ok: true, version: 'git version 2.45.0' })),
      isSafeStorageAvailable: vi.fn(() => false),
      checkBundledRepoTooling: vi.fn(async () => ({ ok: true })),
      checkRepoAccess: vi.fn()
    })

    expect(readiness.ready).toBe(false)
    expect(readiness.items.keychain.status).toBe('missing')
    expect(readiness.items.keychain.recoveryAction).toContain('Enable your OS keychain')
  })

  it('surfaces inaccessible linked repository paths', async () => {
    const readiness = await getRuntimeReadiness(
      {
        checkGitVersion: vi.fn(async () => ({ ok: true, version: 'git version 2.45.0' })),
        isSafeStorageAvailable: vi.fn(() => true),
        checkBundledRepoTooling: vi.fn(async () => ({ ok: true })),
        checkRepoAccess: vi.fn(async (path: string) =>
          path === '/missing/repo' ? { ok: false } : { ok: true }
        )
      },
      [{ id: 'repo-1', name: 'pilog', localPath: '/missing/repo' }]
    )

    expect(readiness.ready).toBe(false)
    expect(readiness.items.localRepositories.status).toBe('degraded')
    expect(readiness.items.localRepositories.detail).toContain('/missing/repo')
    expect(readiness.items.localRepositories.recoveryAction).toContain('Relink')
  })
})
