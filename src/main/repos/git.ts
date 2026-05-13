import simpleGit from 'simple-git'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { RepoAccessDescriptor } from '@shared/ipc'

export type LocalGitMetadata = {
  remoteUrl: string
  defaultBranch: string
  headSha: string
}

type ExecFile = (file: string, args: string[]) => Promise<{ stdout: string; stderr: string }>

const execFileAsync = promisify(execFile)

export function parseRepoAccessDescriptor(localPath: string): RepoAccessDescriptor {
  const match = localPath.match(/^\\\\(wsl\.localhost|wsl\$)\\([^\\]+)\\(.+)$/i)
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
  if (access.kind === 'host') return readLocalGitMetadata(access.displayPath)
  return readWslGitMetadata(access, deps.execFile ?? defaultExecFile)
}

export function parseGitHubOwnerRepo(remoteUrl: string): { owner: string; name: string } | null {
  // HTTPS: https://github.com/owner/repo.git  or  https://github.com/owner/repo
  // SSH:   git@github.com:owner/repo.git      or  git@github.com:owner/repo
  const match = remoteUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (!match) return null
  return { owner: match[1], name: match[2] }
}

async function readWslGitMetadata(
  access: Extract<RepoAccessDescriptor, { kind: 'wsl' }>,
  runExecFile: ExecFile
): Promise<LocalGitMetadata | null> {
  const isRepo = await runWslGit(access, ['rev-parse', '--is-inside-work-tree'], runExecFile)
    .then((stdout) => stdout.trim() === 'true')
    .catch(() => false)
  if (!isRepo) return null

  const remoteUrl = await runWslGit(access, ['remote', 'get-url', 'origin'], runExecFile).catch(
    () => null
  )
  if (!remoteUrl?.trim()) return null

  const headSha = await runWslGit(access, ['rev-parse', 'HEAD'], runExecFile).catch(() => null)
  if (!headSha?.trim()) return null

  const defaultBranch =
    (await runWslGit(access, ['rev-parse', '--abbrev-ref', 'HEAD'], runExecFile).catch(
      () => null
    )) ?? 'main'

  return {
    remoteUrl: remoteUrl.trim(),
    defaultBranch: defaultBranch.trim() || 'main',
    headSha: headSha.trim()
  }
}

async function runWslGit(
  access: Extract<RepoAccessDescriptor, { kind: 'wsl' }>,
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
