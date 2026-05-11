import { safeStorage } from 'electron'
import { accessSync, constants, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { RuntimeReadiness } from '@shared/ipc'
import { resolveRgPath } from './pi/tools/repo-tools'

const execFileAsync = promisify(execFile)

type ReadinessRepo = {
  id: string
  name: string
  localPath: string
}

type RuntimeReadinessDeps = {
  checkGitVersion?: () => Promise<{ ok: true; version: string } | { ok: false; error?: string }>
  isSafeStorageAvailable?: () => boolean
  checkRepoAccess?: (path: string) => Promise<{ ok: boolean }>
  checkBundledRepoTooling?: () => Promise<{ ok: boolean; detail?: string }>
  now?: () => Date
}

export async function getRuntimeReadiness(
  deps: RuntimeReadinessDeps = {},
  repos: ReadinessRepo[] = []
): Promise<RuntimeReadiness> {
  const [git, bundledRepoTooling] = await Promise.all([
    (deps.checkGitVersion ?? checkGitVersion)(),
    (deps.checkBundledRepoTooling ?? checkBundledRepoTooling)()
  ])
  const isSafeStorageAvailable = deps.isSafeStorageAvailable ?? defaultSafeStorageAvailable
  const repoAccess = await checkLocalRepositories(repos, deps.checkRepoAccess ?? checkRepoAccess)

  const items: RuntimeReadiness['items'] = {
    git: git.ok
      ? {
          status: 'ready',
          label: 'Git',
          detail: git.version,
          recoveryAction: 'No action needed.',
          version: git.version
        }
      : {
          status: 'missing',
          label: 'Git',
          detail: 'Git is not available to Pilog.',
          recoveryAction:
            'Install Git and make sure the git command is available from your system PATH.',
          version: null
        },
    keychain: isSafeStorageAvailable()
      ? {
          status: 'ready',
          label: 'Keychain',
          detail: 'Secure credential storage is available.',
          recoveryAction: 'No action needed.'
        }
      : {
          status: 'missing',
          label: 'Keychain',
          detail: 'Secure credential storage is unavailable.',
          recoveryAction:
            'Enable your OS keychain or credential manager, then restart Pilog before connecting GitHub or saving Pi credentials.'
        },
    localRepositories:
      repoAccess.inaccessiblePaths.length === 0
        ? {
            status: 'ready',
            label: 'Local repositories',
            detail:
              repoAccess.checkedCount === 0
                ? 'No linked repositories to check yet.'
                : `${repoAccess.checkedCount} linked repository path${
                    repoAccess.checkedCount === 1 ? '' : 's'
                  } can be read.`,
            recoveryAction:
              repoAccess.checkedCount === 0
                ? 'Link a local GitHub repository when you are ready to generate drafts.'
                : 'No action needed.',
            checkedCount: repoAccess.checkedCount,
            inaccessiblePaths: []
          }
        : {
            status: 'degraded',
            label: 'Local repositories',
            detail: `Pilog cannot read ${repoAccess.inaccessiblePaths.join(', ')}.`,
            recoveryAction:
              'Relink the repository from its current folder, restore the missing folder, or remove the stale repository link.',
            checkedCount: repoAccess.checkedCount,
            inaccessiblePaths: repoAccess.inaccessiblePaths
          },
    bundledRepoTooling: bundledRepoTooling.ok
      ? {
          status: 'ready',
          label: 'Bundled repo tooling',
          detail: bundledRepoTooling.detail ?? 'Pilog bundled repo tools are available.',
          recoveryAction: 'No action needed.'
        }
      : {
          status: 'missing',
          label: 'Bundled repo tooling',
          detail: bundledRepoTooling.detail ?? 'Pilog bundled repo tools are unavailable.',
          recoveryAction:
            'Reinstall Pilog. If the problem continues, keep your notes and share the app logs with support.'
        }
  }

  return {
    ready: Object.values(items).every((item) => item.status === 'ready'),
    checkedAt: (deps.now ?? (() => new Date()))().toISOString(),
    items
  }
}

export function getBlockingRuntimeReadinessMessage(
  readiness: RuntimeReadiness,
  required: Array<keyof RuntimeReadiness['items']>
): string | null {
  const blocked = required
    .map((key) => readiness.items[key])
    .find((item) => item.status !== 'ready')
  if (!blocked) return null
  const verb = blocked.label === 'Local repositories' ? 'need' : 'needs'
  return `${blocked.label} ${verb} attention. ${blocked.detail} ${blocked.recoveryAction}`
}

async function checkGitVersion(): Promise<
  { ok: true; version: string } | { ok: false; error?: string }
> {
  try {
    const { stdout } = await execFileAsync('git', ['--version'], { timeout: 5000 })
    return { ok: true, version: stdout.trim() || 'git version unknown' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function defaultSafeStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

async function checkRepoAccess(path: string): Promise<{ ok: boolean }> {
  try {
    accessSync(path, constants.R_OK)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

async function checkLocalRepositories(
  repos: ReadinessRepo[],
  checkAccess: (path: string) => Promise<{ ok: boolean }>
): Promise<{ checkedCount: number; inaccessiblePaths: string[] }> {
  const inaccessiblePaths: string[] = []
  for (const repo of repos) {
    const result = await checkAccess(repo.localPath)
    if (!result.ok) inaccessiblePaths.push(repo.localPath)
  }
  return { checkedCount: repos.length, inaccessiblePaths }
}

async function checkBundledRepoTooling(): Promise<{ ok: boolean; detail?: string }> {
  const ripgrepPath = resolveRgPath()
  if (!existsSync(ripgrepPath)) {
    return { ok: false, detail: 'Pilog could not find its bundled ripgrep executable.' }
  }

  try {
    await Promise.all([import('@earendil-works/pi-agent-core'), import('@earendil-works/pi-ai')])
  } catch {
    return { ok: false, detail: 'Pilog could not load its bundled Pi runtime packages.' }
  }

  return { ok: true, detail: 'Bundled ripgrep and Pi runtime packages are available.' }
}
