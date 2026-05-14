import simpleGit from 'simple-git'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type {
  NoteCaptureContext,
  RepoAccessDescriptor,
  WslRepoDetectionFailureReason
} from '@shared/ipc'

export type LocalGitMetadata = {
  remoteUrl: string
  defaultBranch: string
  headSha: string
}

type ExecFile = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>
type WslRepoAccessDescriptor = Extract<RepoAccessDescriptor, { kind: 'wsl' }>
type WslGitFailureReason = Exclude<WslRepoDetectionFailureReason, 'unmatched'>
type WslGitCommandResult =
  | { state: 'stdout'; stdout: string }
  | { state: 'wsl-failure'; reason: WslGitFailureReason }

export type GitMetadataReadResult =
  | { state: 'metadata'; metadata: LocalGitMetadata }
  | { state: 'missing' }
  | {
      state: 'wsl-failure'
      reason: WslGitFailureReason
      access: WslRepoAccessDescriptor
    }

const execFileAsync = promisify(execFile)
const WSL_UNC_PATH_PATTERN = /^\\\\(wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$/i

export function parseRepoAccessDescriptor(localPath: string): RepoAccessDescriptor {
  const match = localPath.match(WSL_UNC_PATH_PATTERN)
  if (!match) return { kind: 'host', displayPath: localPath }

  const [, , distro, pathInsideDistro] = match
  return {
    kind: 'wsl',
    displayPath: localPath,
    distro,
    linuxPath: `/${pathInsideDistro.replace(/\\/g, '/')}`
  }
}

export async function isGitRepo(localPath: string): Promise<boolean> {
  return simpleGit(localPath)
    .checkIsRepo()
    .catch(() => false)
}

export async function readLocalGitMetadata(localPath: string): Promise<LocalGitMetadata | null> {
  const git = simpleGit(localPath)

  const isRepo = await git.checkIsRepo().catch(() => false)
  if (!isRepo) return null

  const remotes = await git.getRemotes(true)
  const origin = remotes.find((r) => r.name === 'origin')
  if (!origin?.refs.fetch) return null

  const headSha = await git.revparse(['HEAD']).catch(() => null)
  if (!headSha) return null

  let defaultBranch: string
  try {
    const branch = await git.revparse(['--abbrev-ref', 'HEAD'])
    defaultBranch = branch.trim()
  } catch {
    defaultBranch = 'main'
  }

  return {
    remoteUrl: origin.refs.fetch,
    defaultBranch,
    headSha: headSha.trim()
  }
}

export async function readGitMetadata(
  access: RepoAccessDescriptor,
  deps: { execFile?: ExecFile } = {}
): Promise<LocalGitMetadata | null> {
  const result = await readGitMetadataResult(access, deps)
  return result.state === 'metadata' ? result.metadata : null
}

export async function readGitMetadataResult(
  access: RepoAccessDescriptor,
  deps: { execFile?: ExecFile } = {}
): Promise<GitMetadataReadResult> {
  if (access.kind === 'host') {
    const metadata = await readLocalGitMetadata(access.displayPath)
    return metadata ? { state: 'metadata', metadata } : { state: 'missing' }
  }
  return readWslGitMetadataResult(access, deps.execFile ?? defaultExecFile)
}

export async function readGitCaptureContext(
  access: RepoAccessDescriptor,
  deps: { execFile?: ExecFile; capturedAt?: string } = {}
): Promise<NoteCaptureContext> {
  const capturedAt = deps.capturedAt ?? new Date().toISOString()
  try {
    if (access.kind === 'host') {
      return await readHostGitCaptureContext(access.displayPath, capturedAt)
    }
    return await readWslGitCaptureContext(access, deps.execFile ?? defaultExecFile, capturedAt)
  } catch {
    return { state: 'unavailable', capturedAt }
  }
}

async function readHostGitCaptureContext(
  localPath: string,
  capturedAt: string
): Promise<NoteCaptureContext> {
  const git = simpleGit(localPath)
  const isRepo = await git.checkIsRepo().catch(() => false)
  if (!isRepo) return { state: 'unavailable', capturedAt }

  const [branch, headSha, headSubject, status] = await Promise.all([
    git.revparse(['--abbrev-ref', 'HEAD']).catch(() => null),
    git.revparse(['HEAD']).catch(() => null),
    git.raw(['log', '-1', '--pretty=%s']).catch(() => null),
    git.status()
  ])

  return {
    state: 'captured',
    branch: normalizeGitValue(branch),
    dirtyFiles: Array.from(
      new Set(status.files.filter((file) => file.working_dir !== ' ').map((file) => file.path))
    ).sort(),
    stagedFiles: Array.from(
      new Set(status.files.filter((file) => file.index !== ' ').map((file) => file.path))
    ).sort(),
    headSha: normalizeGitValue(headSha),
    headSubject: normalizeGitValue(headSubject),
    capturedAt
  }
}

async function readWslGitCaptureContext(
  access: WslRepoAccessDescriptor,
  runExecFile: ExecFile,
  capturedAt: string
): Promise<NoteCaptureContext> {
  const isRepoResult = await runWslGitResult(
    access,
    ['rev-parse', '--is-inside-work-tree'],
    runExecFile
  )
  if (isRepoResult.state !== 'stdout' || isRepoResult.stdout.trim() !== 'true') {
    return { state: 'unavailable', capturedAt }
  }

  const [branch, headSha, headSubject, status] = await Promise.all([
    runWslGitResult(access, ['rev-parse', '--abbrev-ref', 'HEAD'], runExecFile),
    runWslGitResult(access, ['rev-parse', 'HEAD'], runExecFile),
    runWslGitResult(access, ['log', '-1', '--pretty=%s'], runExecFile),
    runWslGitResult(access, ['status', '--porcelain'], runExecFile)
  ])

  if (status.state !== 'stdout') return { state: 'unavailable', capturedAt }
  const paths = parsePorcelainStatus(status.stdout)

  return {
    state: 'captured',
    branch: branch.state === 'stdout' ? normalizeGitValue(branch.stdout) : null,
    dirtyFiles: paths.dirtyFiles,
    stagedFiles: paths.stagedFiles,
    headSha: headSha.state === 'stdout' ? normalizeGitValue(headSha.stdout) : null,
    headSubject: headSubject.state === 'stdout' ? normalizeGitValue(headSubject.stdout) : null,
    capturedAt
  }
}

function parsePorcelainStatus(stdout: string): { dirtyFiles: string[]; stagedFiles: string[] } {
  const dirtyFiles = new Set<string>()
  const stagedFiles = new Set<string>()
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const index = line[0]
    const workingTree = line[1]
    const path = line.slice(3).split(' -> ').pop()?.trim()
    if (!path) continue
    if (index !== ' ' && index !== '?') stagedFiles.add(path)
    if (workingTree !== ' ' || index === '?') dirtyFiles.add(path)
  }
  return {
    dirtyFiles: Array.from(dirtyFiles).sort(),
    stagedFiles: Array.from(stagedFiles).sort()
  }
}

function normalizeGitValue(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function parseGitHubOwnerRepo(remoteUrl: string): { owner: string; name: string } | null {
  // HTTPS: https://github.com/owner/repo.git  or  https://github.com/owner/repo
  // SSH:   git@github.com:owner/repo.git      or  git@github.com:owner/repo
  const match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (!match) return null
  return { owner: match[1], name: match[2] }
}

async function readWslGitMetadataResult(
  access: WslRepoAccessDescriptor,
  runExecFile: ExecFile
): Promise<GitMetadataReadResult> {
  const isRepoResult = await runWslGitResult(
    access,
    ['rev-parse', '--is-inside-work-tree'],
    runExecFile
  )
  if (isRepoResult.state === 'wsl-failure') return { ...isRepoResult, access }
  if (isRepoResult.stdout.trim() !== 'true') {
    return { state: 'wsl-failure', reason: 'not-git', access }
  }

  const remoteUrlResult = await runWslGitResult(
    access,
    ['remote', 'get-url', 'origin'],
    runExecFile
  )
  if (remoteUrlResult.state === 'wsl-failure') {
    return {
      state: 'wsl-failure',
      reason: remoteUrlResult.reason === 'not-git' ? 'no-origin' : remoteUrlResult.reason,
      access
    }
  }
  if (!remoteUrlResult.stdout.trim()) {
    return { state: 'wsl-failure', reason: 'no-origin', access }
  }

  const headShaResult = await runWslGitResult(access, ['rev-parse', 'HEAD'], runExecFile)
  if (headShaResult.state === 'wsl-failure') return { ...headShaResult, access }
  if (!headShaResult.stdout.trim()) return { state: 'wsl-failure', reason: 'not-git', access }

  const defaultBranchResult = await runWslGitResult(
    access,
    ['rev-parse', '--abbrev-ref', 'HEAD'],
    runExecFile
  )
  const defaultBranch = defaultBranchResult.state === 'stdout' ? defaultBranchResult.stdout : 'main'

  return {
    state: 'metadata',
    metadata: {
      remoteUrl: remoteUrlResult.stdout.trim(),
      defaultBranch: defaultBranch.trim() || 'main',
      headSha: headShaResult.stdout.trim()
    }
  }
}

async function runWslGit(
  access: WslRepoAccessDescriptor,
  gitArgs: string[],
  runExecFile: ExecFile
): Promise<string> {
  const { stdout } = await runExecFile('wsl.exe', [
    '-d',
    access.distro,
    '--cd',
    access.linuxPath,
    '--',
    'git',
    ...gitArgs
  ])
  return stdout
}

async function runWslGitResult(
  access: WslRepoAccessDescriptor,
  gitArgs: string[],
  runExecFile: ExecFile
): Promise<WslGitCommandResult> {
  try {
    return { state: 'stdout', stdout: await runWslGit(access, gitArgs, runExecFile) }
  } catch (error) {
    return { state: 'wsl-failure', reason: classifyWslGitFailure(error, gitArgs) }
  }
}

function classifyWslGitFailure(error: unknown, gitArgs: string[]): WslGitFailureReason {
  const text = getProcessFailureText(error)
  if (isMissingWslExecutable(error, text)) return 'wsl-unavailable'
  if (matchesAny(text, ['wsl_e_distro_not_found', 'no distribution with the supplied name'])) {
    return 'distro-unavailable'
  }
  if (
    matchesAny(text, [
      'execvpe(/usr/bin/git) failed',
      'execvpe(git) failed',
      'git: not found',
      'command not found: git'
    ])
  ) {
    return 'git-missing'
  }
  if (
    matchesAny(text, [
      'the directory name is invalid',
      'chdir',
      'cannot access',
      'no such file or directory'
    ]) &&
    !matchesAny(text, ['not a git repository', "no such remote 'origin'"])
  ) {
    return 'path-missing'
  }
  if (isOriginRemoteLookup(gitArgs)) return 'no-origin'
  return 'not-git'
}

function isOriginRemoteLookup(gitArgs: string[]): boolean {
  return gitArgs.join(' ') === 'remote get-url origin'
}

function getProcessFailureText(error: unknown): string {
  if (!(error instanceof Error)) return String(error).toLowerCase()
  const details = [
    error.message,
    readErrorProperty(error, 'stderr'),
    readErrorProperty(error, 'stdout'),
    readErrorProperty(error, 'code')
  ]
  return details.filter(Boolean).join('\n').toLowerCase()
}

function readErrorProperty(error: Error, key: string): string {
  const value = (error as Error & Record<string, unknown>)[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function isMissingWslExecutable(error: unknown, text: string): boolean {
  return (
    (error instanceof Error && readErrorProperty(error, 'code') === 'ENOENT') ||
    matchesAny(text, ['enoent', 'not recognized'])
  )
}

function matchesAny(input: string, patterns: string[]): boolean {
  return patterns.some((pattern) => input.includes(pattern))
}

async function defaultExecFile(
  file: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(file, args, {
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 1024 * 1024
  })
  return { stdout, stderr }
}
