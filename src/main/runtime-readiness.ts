import { app, safeStorage } from 'electron'
import { accessSync, constants, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { RuntimeReadiness, RuntimeReadinessItem } from '@shared/ipc'
import { resolveRgPath } from './pi/tools/repo-tools'

const execFileAsync = promisify(execFile)
const NO_ACTION_NEEDED = 'No action needed.'

export const REPO_LINK_RUNTIME_REQUIREMENTS = ['git', 'keychain'] as const
export const DRAFT_GENERATION_RUNTIME_REQUIREMENTS = [
  'git',
  'keychain',
  'localRepositories',
  'bundledRepoTooling'
] as const

type ReadinessRepo = {
  id: string
  name: string
  localPath: string
}

type GitVersionCheckResult = { ok: true; version: string } | { ok: false; error?: string }

type RepoAccessCheckResult = {
  checkedCount: number
  inaccessiblePaths: string[]
}

type BundledRepoToolingCheckResult = {
  ok: boolean
  detail?: string
}

type RuntimeReadinessDeps = {
  checkGitVersion?: () => Promise<GitVersionCheckResult>
  isSafeStorageAvailable?: () => boolean
  canUseInsecureCredentialFallback?: () => boolean
  checkRepoAccess?: (path: string) => Promise<{ ok: boolean }>
  checkBundledRepoTooling?: () => Promise<BundledRepoToolingCheckResult>
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
  const canUseInsecureCredentialFallback =
    deps.canUseInsecureCredentialFallback ?? defaultCanUseInsecureCredentialFallback
  const repoAccess = await checkLocalRepositories(repos, deps.checkRepoAccess ?? checkRepoAccess)

  const items: RuntimeReadiness['items'] = {
    git: buildGitReadinessItem(git),
    keychain: buildKeychainReadinessItem({
      safeStorageAvailable: isSafeStorageAvailable(),
      insecureFallbackAvailable: canUseInsecureCredentialFallback()
    }),
    localRepositories: buildLocalRepositoriesReadinessItem(repoAccess),
    bundledRepoTooling: buildBundledRepoToolingReadinessItem(bundledRepoTooling)
  }

  return {
    ready: Object.values(items).every((item) => item.status === 'ready'),
    checkedAt: (deps.now ?? (() => new Date()))().toISOString(),
    items
  }
}

export function getBlockingRuntimeReadinessMessage(
  readiness: RuntimeReadiness,
  required: readonly (keyof RuntimeReadiness['items'])[]
): string | null {
  const blocked = required
    .map((key) => readiness.items[key])
    .find((item) => item.status !== 'ready')
  if (!blocked) return null
  const verb = blocked.label === 'Local repositories' ? 'need' : 'needs'
  return `${blocked.label} ${verb} attention. ${blocked.detail} ${blocked.recoveryAction}`
}

function buildGitReadinessItem(git: GitVersionCheckResult): RuntimeReadiness['items']['git'] {
  if (!git.ok) {
    return {
      status: 'missing',
      label: 'Git',
      detail: 'Git is not available to Pilog.',
      recoveryAction:
        'Install Git and make sure the git command is available from your system PATH.',
      version: null
    }
  }

  return {
    status: 'ready',
    label: 'Git',
    detail: git.version,
    recoveryAction: NO_ACTION_NEEDED,
    version: git.version
  }
}

function buildKeychainReadinessItem(input: {
  safeStorageAvailable: boolean
  insecureFallbackAvailable: boolean
}): RuntimeReadinessItem {
  if (!input.safeStorageAvailable && !input.insecureFallbackAvailable) {
    return {
      status: 'missing',
      label: 'Keychain',
      detail: 'Secure credential storage is unavailable.',
      recoveryAction:
        'Enable your OS keychain or credential manager, then restart Pilog before connecting GitHub or saving Pi credentials.'
    }
  }

  if (!input.safeStorageAvailable && input.insecureFallbackAvailable) {
    return {
      status: 'ready',
      label: 'Keychain',
      detail: 'Development plaintext credential fallback is active.',
      recoveryAction: NO_ACTION_NEEDED
    }
  }

  return {
    status: 'ready',
    label: 'Keychain',
    detail: 'Secure credential storage is available.',
    recoveryAction: NO_ACTION_NEEDED
  }
}

function buildLocalRepositoriesReadinessItem(
  repoAccess: RepoAccessCheckResult
): RuntimeReadiness['items']['localRepositories'] {
  if (repoAccess.inaccessiblePaths.length > 0) {
    return {
      status: 'degraded',
      label: 'Local repositories',
      detail: `Pilog cannot read ${repoAccess.inaccessiblePaths.join(', ')}.`,
      recoveryAction:
        'Relink the repository from its current folder, restore the missing folder, or remove the stale repository link.',
      checkedCount: repoAccess.checkedCount,
      inaccessiblePaths: repoAccess.inaccessiblePaths
    }
  }

  if (repoAccess.checkedCount === 0) {
    return {
      status: 'ready',
      label: 'Local repositories',
      detail: 'No linked repositories to check yet.',
      recoveryAction: 'Link a local GitHub repository when you are ready to generate drafts.',
      checkedCount: repoAccess.checkedCount,
      inaccessiblePaths: []
    }
  }

  return {
    status: 'ready',
    label: 'Local repositories',
    detail: `${repoAccess.checkedCount} linked repository path${repoAccess.checkedCount === 1 ? '' : 's'} can be read.`,
    recoveryAction: NO_ACTION_NEEDED,
    checkedCount: repoAccess.checkedCount,
    inaccessiblePaths: []
  }
}

function buildBundledRepoToolingReadinessItem(
  bundledRepoTooling: BundledRepoToolingCheckResult
): RuntimeReadinessItem {
  if (!bundledRepoTooling.ok) {
    return {
      status: 'missing',
      label: 'Bundled repo tooling',
      detail: bundledRepoTooling.detail ?? 'Pilog bundled repo tools are unavailable.',
      recoveryAction:
        'Reinstall Pilog. If the problem continues, keep your notes and share the app logs with support.'
    }
  }

  return {
    status: 'ready',
    label: 'Bundled repo tooling',
    detail: bundledRepoTooling.detail ?? 'Pilog bundled repo tools are available.',
    recoveryAction: NO_ACTION_NEEDED
  }
}

async function checkGitVersion(): Promise<GitVersionCheckResult> {
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

function defaultCanUseInsecureCredentialFallback(): boolean {
  return app?.isPackaged !== true || process.env.PILOG_DEBUG_IPC === '1'
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
): Promise<RepoAccessCheckResult> {
  const inaccessiblePaths: string[] = []
  for (const repo of repos) {
    const result = await checkAccess(repo.localPath)
    if (!result.ok) inaccessiblePaths.push(repo.localPath)
  }
  return { checkedCount: repos.length, inaccessiblePaths }
}

async function checkBundledRepoTooling(): Promise<BundledRepoToolingCheckResult> {
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
