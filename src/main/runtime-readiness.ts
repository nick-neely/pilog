import { app, safeStorage } from 'electron'
import { accessSync, constants, existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { RepoAccessDescriptor, RuntimeReadiness, RuntimeReadinessItem } from '@shared/ipc'
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
  accessKind?: 'host' | 'wsl'
  wslDistro?: string | null
  wslPath?: string | null
}

type GitVersionCheckResult = { ok: true; version: string } | { ok: false; error?: string }

type RepoAccessCheck = { ok: true } | { ok: false; detail?: string; recoveryAction?: string }

type RepoAccessFailure = {
  path: string
  detail?: string
  recoveryAction?: string
}

type RepoAccessCheckResult = {
  checkedCount: number
  failures: RepoAccessFailure[]
}

type BundledRepoToolingCheckResult = {
  ok: boolean
  detail?: string
}

type WslRepoAccessDescriptor = Extract<RepoAccessDescriptor, { kind: 'wsl' }>

type RepoAccessChecker = (
  access: RepoAccessDescriptor,
  repo: ReadinessRepo
) => Promise<RepoAccessCheck>

type ExecFile = (
  file: string,
  args: string[],
  options?: { windowsHide?: boolean; timeout?: number; maxBuffer?: number }
) => Promise<{ stdout: string; stderr: string }>

type RuntimeReadinessDeps = {
  checkGitVersion?: () => Promise<GitVersionCheckResult>
  isSafeStorageAvailable?: () => boolean
  canUseInsecureCredentialFallback?: () => boolean
  checkRepoAccess?: RepoAccessChecker
  runWslRepoAccessCheck?: ExecFile
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
  const repoAccess = await checkLocalRepositories(
    repos,
    deps.checkRepoAccess ??
      ((access) => checkRepoAccess(access, deps.runWslRepoAccessCheck ?? defaultExecFile))
  )

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
  if (repoAccess.failures.length > 0) {
    const inaccessiblePaths = repoAccess.failures.map((failure) => failure.path)

    return {
      status: 'degraded',
      label: 'Local repositories',
      detail: `Pilog cannot read ${formatRepoAccessFailureDetail(repoAccess.failures)}.`,
      recoveryAction: formatRepoAccessRecoveryAction(repoAccess.failures),
      checkedCount: repoAccess.checkedCount,
      inaccessiblePaths
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

async function checkRepoAccess(
  access: RepoAccessDescriptor,
  runWslRepoAccessCheck: ExecFile
): Promise<RepoAccessCheck> {
  if (access.kind === 'wsl') return checkWslRepoAccess(access, runWslRepoAccessCheck)

  try {
    accessSync(access.displayPath, constants.R_OK)
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

async function checkLocalRepositories(
  repos: ReadinessRepo[],
  checkAccess: RepoAccessChecker
): Promise<RepoAccessCheckResult> {
  const failures: RepoAccessFailure[] = []
  for (const repo of repos) {
    const access = repoToAccessDescriptor(repo)
    if (!access) {
      failures.push(missingWslAccessMetadataFailure(repo))
      continue
    }

    const result = await checkAccess(access, repo)
    if (!result.ok) {
      failures.push({
        path: access.displayPath,
        detail: result.detail,
        recoveryAction: result.recoveryAction
      })
    }
  }
  return { checkedCount: repos.length, failures }
}

function formatRepoAccessFailureDetail(failures: RepoAccessFailure[]): string {
  return failures
    .map((failure) => (failure.detail ? `${failure.path} (${failure.detail})` : failure.path))
    .join(', ')
}

function formatRepoAccessRecoveryAction(failures: RepoAccessFailure[]): string {
  const recoveryActions = Array.from(
    new Set(
      failures
        .map((failure) => failure.recoveryAction)
        .filter((action): action is string => typeof action === 'string')
    )
  )
  if (recoveryActions.length > 0) return recoveryActions.join(' ')
  return 'Relink the repository from its current folder, restore the missing folder, or remove the stale repository link.'
}

function missingWslAccessMetadataFailure(repo: ReadinessRepo): RepoAccessFailure {
  return {
    path: repo.localPath,
    detail: 'The repository link is missing WSL access metadata.',
    recoveryAction: 'Relink the repository from its current WSL folder.'
  }
}

function repoToAccessDescriptor(repo: ReadinessRepo): RepoAccessDescriptor | null {
  if (repo.accessKind === 'wsl') {
    if (!repo.wslDistro || !repo.wslPath) return null
    return {
      kind: 'wsl',
      displayPath: repo.localPath,
      distro: repo.wslDistro,
      linuxPath: repo.wslPath
    }
  }

  return {
    kind: 'host',
    displayPath: repo.localPath
  }
}

async function checkWslRepoAccess(
  access: WslRepoAccessDescriptor,
  runExecFile: ExecFile
): Promise<RepoAccessCheck> {
  try {
    const { stdout } = await runExecFile(
      'wsl.exe',
      [
        '-d',
        access.distro,
        '--cd',
        access.linuxPath,
        '--',
        'git',
        'rev-parse',
        '--is-inside-work-tree'
      ],
      {
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 1024 * 1024
      }
    )
    if (stdout.trim() === 'true') return { ok: true }

    return {
      ok: false,
      detail: `${access.linuxPath} is not a Git repository in WSL distro ${access.distro}.`,
      recoveryAction:
        'Relink the repository from its Git root, restore the missing folder, or remove the stale repository link.'
    }
  } catch (error) {
    return describeWslRepoAccessFailure(access, error)
  }
}

function describeWslRepoAccessFailure(
  access: WslRepoAccessDescriptor,
  error: unknown
): RepoAccessCheck {
  const message = extractErrorText(error)
  const lowerMessage = message.toLowerCase()

  if (isSpawnMissing(error) || lowerMessage.includes('wsl.exe')) {
    return {
      ok: false,
      detail: 'WSL is unavailable on this Windows installation.',
      recoveryAction: 'Install or enable WSL, then reload runtime readiness.'
    }
  }

  if (lowerMessage.includes('distribution') || lowerMessage.includes('distro')) {
    return {
      ok: false,
      detail: `WSL distro ${access.distro} is unavailable.`,
      recoveryAction: `Restore or start the ${access.distro} WSL distro, then reload runtime readiness.`
    }
  }

  if (lowerMessage.includes('git: not found') || lowerMessage.includes('git is not recognized')) {
    return {
      ok: false,
      detail: `Git is unavailable inside WSL distro ${access.distro}.`,
      recoveryAction: `Install Git inside ${access.distro}, then reload runtime readiness.`
    }
  }

  if (
    lowerMessage.includes('cannot access') ||
    lowerMessage.includes('no such file') ||
    lowerMessage.includes('not found')
  ) {
    return {
      ok: false,
      detail: `WSL path ${access.linuxPath} is unavailable in distro ${access.distro}.`,
      recoveryAction:
        'Restore the missing WSL project path, relink the repository, or remove the stale repository link.'
    }
  }

  if (lowerMessage.includes('not a git repository')) {
    return {
      ok: false,
      detail: `${access.linuxPath} is not a Git repository in WSL distro ${access.distro}.`,
      recoveryAction:
        'Relink the repository from its Git root, restore the missing folder, or remove the stale repository link.'
    }
  }

  return {
    ok: false,
    detail: `WSL repo access failed for ${access.distro}:${access.linuxPath}.`,
    recoveryAction:
      'Check that WSL, the selected distro, Git, and the project path are available, then reload runtime readiness.'
  }
}

function extractErrorText(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error)
  const candidate = error as {
    message?: unknown
    stderr?: unknown
    stdout?: unknown
    code?: unknown
  }
  return [candidate.stderr, candidate.stdout, candidate.message, candidate.code]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
}

function isSpawnMissing(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

async function defaultExecFile(
  file: string,
  args: string[],
  options?: { windowsHide?: boolean; timeout?: number; maxBuffer?: number }
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(file, args, options)
  return { stdout: String(stdout), stderr: String(stderr) }
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
