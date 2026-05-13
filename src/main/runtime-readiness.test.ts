import { describe, expect, it, vi } from 'vitest'
import { getRuntimeReadiness } from './runtime-readiness'
import type { RepoAccessDescriptor } from '@shared/ipc'

const GIT_READY = { ok: true, version: 'git version 2.45.0' } as const
const WSL_DISPLAY_PATH = '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog'
const WSL_LINUX_PATH = '/home/neely/dev/pilog'

function readyDeps(): {
  checkGitVersion: () => Promise<typeof GIT_READY>
  isSafeStorageAvailable: () => boolean
  checkBundledRepoTooling: () => Promise<{ ok: boolean }>
} {
  return {
    checkGitVersion: vi.fn(async () => GIT_READY),
    isSafeStorageAvailable: vi.fn(() => true),
    checkBundledRepoTooling: vi.fn(async () => ({ ok: true }))
  }
}

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

  it('allows unavailable safeStorage when the development credential fallback is active', async () => {
    const readiness = await getRuntimeReadiness({
      ...readyDeps(),
      isSafeStorageAvailable: vi.fn(() => false),
      canUseInsecureCredentialFallback: vi.fn(() => true),
      checkRepoAccess: vi.fn()
    })

    expect(readiness.ready).toBe(true)
    expect(readiness.items.keychain.status).toBe('ready')
    expect(readiness.items.keychain.detail).toContain('Development plaintext')
  })

  it('surfaces unavailable safeStorage as a keychain prerequisite in packaged mode', async () => {
    const readiness = await getRuntimeReadiness({
      ...readyDeps(),
      isSafeStorageAvailable: vi.fn(() => false),
      canUseInsecureCredentialFallback: vi.fn(() => false),
      checkRepoAccess: vi.fn()
    })

    expect(readiness.ready).toBe(false)
    expect(readiness.items.keychain.status).toBe('missing')
    expect(readiness.items.keychain.recoveryAction).toContain('Enable your OS keychain')
  })

  it('surfaces inaccessible linked repository paths', async () => {
    const readiness = await getRuntimeReadiness(
      {
        ...readyDeps(),
        checkRepoAccess: vi.fn(async (access: RepoAccessDescriptor) =>
          access.displayPath === '/missing/repo' ? { ok: false } : { ok: true }
        )
      },
      [{ id: 'repo-1', name: 'pilog', localPath: '/missing/repo' }]
    )

    expect(readiness.ready).toBe(false)
    expect(readiness.items.localRepositories.status).toBe('degraded')
    expect(readiness.items.localRepositories.detail).toContain('/missing/repo')
    expect(readiness.items.localRepositories.recoveryAction).toContain('Relink')
  })

  it('checks WSL linked repositories through their persisted access descriptor', async () => {
    const checkRepoAccess = vi.fn(async () => ({ ok: true }))

    const readiness = await getRuntimeReadiness(
      {
        ...readyDeps(),
        checkRepoAccess
      },
      [
        {
          id: 'repo-1',
          name: 'pilog',
          localPath: WSL_DISPLAY_PATH,
          accessKind: 'wsl',
          wslDistro: 'Ubuntu',
          wslPath: WSL_LINUX_PATH
        }
      ]
    )

    expect(readiness.ready).toBe(true)
    expect(checkRepoAccess).toHaveBeenCalledWith(
      {
        kind: 'wsl',
        displayPath: WSL_DISPLAY_PATH,
        distro: 'Ubuntu',
        linuxPath: WSL_LINUX_PATH
      },
      expect.objectContaining({ id: 'repo-1' })
    )
  })

  it('reports stale WSL repository links before draft generation starts', async () => {
    const readiness = await getRuntimeReadiness(
      {
        ...readyDeps(),
        checkRepoAccess: vi.fn(async () => ({
          ok: false,
          detail: 'WSL distro Ubuntu cannot read /home/neely/dev/pilog because Git is unavailable.',
          recoveryAction: 'Install Git inside Ubuntu, then reload runtime readiness.'
        }))
      },
      [
        {
          id: 'repo-1',
          name: 'pilog',
          localPath: WSL_DISPLAY_PATH,
          accessKind: 'wsl',
          wslDistro: 'Ubuntu',
          wslPath: WSL_LINUX_PATH
        }
      ]
    )

    expect(readiness.ready).toBe(false)
    expect(readiness.items.localRepositories.status).toBe('degraded')
    expect(readiness.items.localRepositories.detail).toContain(WSL_DISPLAY_PATH)
    expect(readiness.items.localRepositories.detail).toContain('Git is unavailable')
    expect(readiness.items.localRepositories.recoveryAction).toContain('Install Git inside Ubuntu')
  })

  it('checks WSL repositories with wsl.exe using distro and Linux path arguments', async () => {
    const runWslRepoAccessCheck = vi.fn(async () => ({ stdout: 'true\n', stderr: '' }))

    const readiness = await getRuntimeReadiness(
      {
        ...readyDeps(),
        runWslRepoAccessCheck
      },
      [
        {
          id: 'repo-1',
          name: 'pilog',
          localPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pi log',
          accessKind: 'wsl',
          wslDistro: 'Ubuntu',
          wslPath: '/home/neely/dev/pi log'
        }
      ]
    )

    expect(readiness.ready).toBe(true)
    expect(runWslRepoAccessCheck).toHaveBeenCalledWith(
      'wsl.exe',
      [
        '-d',
        'Ubuntu',
        '--cd',
        '/home/neely/dev/pi log',
        '--',
        'git',
        'rev-parse',
        '--is-inside-work-tree'
      ],
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('reports missing WSL project paths with location-specific recovery copy', async () => {
    const readiness = await getRuntimeReadiness(
      {
        ...readyDeps(),
        runWslRepoAccessCheck: vi.fn(async () => {
          throw { stderr: 'chdir /home/neely/dev/missing: no such file or directory' }
        })
      },
      [
        {
          id: 'repo-1',
          name: 'pilog',
          localPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\missing',
          accessKind: 'wsl',
          wslDistro: 'Ubuntu',
          wslPath: '/home/neely/dev/missing'
        }
      ]
    )

    expect(readiness.ready).toBe(false)
    expect(readiness.items.localRepositories.detail).toContain('/home/neely/dev/missing')
    expect(readiness.items.localRepositories.detail).toContain('Ubuntu')
    expect(readiness.items.localRepositories.recoveryAction).toContain('Restore the missing WSL')
  })

  it('degrades WSL repository links that are missing persisted operational metadata', async () => {
    const checkRepoAccess = vi.fn(async () => ({ ok: true }))

    const readiness = await getRuntimeReadiness(
      {
        ...readyDeps(),
        checkRepoAccess
      },
      [
        {
          id: 'repo-1',
          name: 'pilog',
          localPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
          accessKind: 'wsl',
          wslDistro: null,
          wslPath: null
        }
      ]
    )

    expect(readiness.ready).toBe(false)
    expect(readiness.items.localRepositories.detail).toContain('missing WSL access metadata')
    expect(readiness.items.localRepositories.recoveryAction).toContain('Relink')
    expect(checkRepoAccess).not.toHaveBeenCalled()
  })

  it('handles mixed host-local and WSL repository readiness checks', async () => {
    const checkRepoAccess = vi.fn(async (access: RepoAccessDescriptor) =>
      access.kind === 'host' ? { ok: true } : { ok: false, detail: 'WSL path is missing.' }
    )

    const readiness = await getRuntimeReadiness(
      {
        ...readyDeps(),
        checkRepoAccess
      },
      [
        { id: 'repo-host', name: 'host', localPath: '/repos/host' },
        {
          id: 'repo-wsl',
          name: 'wsl',
          localPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\missing',
          accessKind: 'wsl',
          wslDistro: 'Ubuntu',
          wslPath: '/home/neely/dev/missing'
        }
      ]
    )

    expect(readiness.ready).toBe(false)
    expect(readiness.items.localRepositories.checkedCount).toBe(2)
    expect(readiness.items.localRepositories.detail).toContain(
      '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\missing'
    )
    expect(readiness.items.localRepositories.detail).not.toContain('/repos/host')
    expect(checkRepoAccess).toHaveBeenNthCalledWith(
      1,
      { kind: 'host', displayPath: '/repos/host' },
      expect.objectContaining({ id: 'repo-host' })
    )
    expect(checkRepoAccess).toHaveBeenNthCalledWith(
      2,
      {
        kind: 'wsl',
        displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\missing',
        distro: 'Ubuntu',
        linuxPath: '/home/neely/dev/missing'
      },
      expect.objectContaining({ id: 'repo-wsl' })
    )
  })
})
