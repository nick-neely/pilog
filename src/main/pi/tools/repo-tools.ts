import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { RepoAccessDescriptor } from '@shared/ipc'
import { rgPath } from '@vscode/ripgrep'
import { Type, type Static } from 'typebox'
import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import simpleGit from 'simple-git'
import { globSync } from 'tinyglobby'
import { createRepoSandbox } from './sandbox'

const MAX_READ_BYTES = 256 * 1024
const MAX_DIR_ENTRIES = 500
const MAX_GLOB_RESULTS = 500
const MAX_GREP_MATCHES = 200
const MAX_GIT_OUTPUT_BYTES = 256 * 1024
const WSL_COMMAND_TIMEOUT_MS = 10000

type WslRepoAccessDescriptor = Extract<RepoAccessDescriptor, { kind: 'wsl' }>
type RepoToolAccess = string | RepoAccessDescriptor
type ExecFileSync = typeof execFileSync
type SpawnSync = typeof spawnSync

type RepoToolOptions = {
  execFileSync?: ExecFileSync
  spawnSync?: SpawnSync
}

const ReadFileParameters = Type.Object({
  path: Type.String(),
  maxBytes: Type.Optional(Type.Number({ minimum: 1, maximum: MAX_READ_BYTES }))
})
type ReadFileParameters = Static<typeof ReadFileParameters>

const ListDirParameters = Type.Object({
  path: Type.String(),
  depth: Type.Optional(Type.Number({ minimum: 0, maximum: 4 }))
})
type ListDirParameters = Static<typeof ListDirParameters>

const GlobParameters = Type.Object({ pattern: Type.String() })
type GlobParameters = Static<typeof GlobParameters>

const GrepParameters = Type.Object({
  pattern: Type.String(),
  path: Type.Optional(Type.String()),
  isRegex: Type.Optional(Type.Boolean())
})
type GrepParameters = Static<typeof GrepParameters>

const GitDiffParameters = Type.Object({
  path: Type.Optional(Type.String()),
  staged: Type.Optional(Type.Boolean())
})
type GitDiffParameters = Static<typeof GitDiffParameters>

const GitLogParameters = Type.Object({
  path: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 }))
})
type GitLogParameters = Static<typeof GitLogParameters>

const GitBlameParameters = Type.Object({
  path: Type.String(),
  lineRange: Type.Optional(
    Type.Object({
      start: Type.Number({ minimum: 1 }),
      end: Type.Number({ minimum: 1 })
    })
  )
})
type GitBlameParameters = Static<typeof GitBlameParameters>

type RipgrepEvent = {
  type: string
  data: {
    path: { text: string }
    line_number: number
    lines: { text: string }
  }
}

const textResult = (
  details: unknown
): { content: [{ type: 'text'; text: string }]; details: unknown } => ({
  content: [{ type: 'text', text: JSON.stringify(details, null, 2) }],
  details
})

export function createReadOnlyRepoTools(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool[] {
  return [
    createReadFileTool(accessInput, options),
    createListDirTool(accessInput, options),
    createGlobTool(accessInput, options),
    createGrepTool(accessInput, options),
    createGitStatusTool(accessInput, options),
    createGitDiffTool(accessInput, options),
    createGitLogTool(accessInput, options),
    createGitBlameTool(accessInput, options)
  ]
}

export function createReadFileTool(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool<typeof ReadFileParameters> {
  return {
    name: 'read_file',
    label: 'Read File',
    description: 'Read a UTF-8 text file from the selected repository.',
    parameters: ReadFileParameters,
    executionMode: 'parallel',
    execute: async (_toolCallId, input) => {
      const access = normalizeRepoToolAccess(accessInput)
      if (access.kind === 'wsl') return executeWslReadFile(access, input, options.execFileSync)

      const repoPath = access.displayPath
      const sandbox = createRepoSandbox(repoPath)
      const filePath = sandbox.resolvePath(input.path)
      const maxBytes = input.maxBytes ?? MAX_READ_BYTES
      const bytes = readFileSync(filePath).subarray(0, maxBytes)
      return textResult({
        path: path.relative(sandbox.root, filePath),
        truncated: statSync(filePath).size > maxBytes,
        content: bytes.toString('utf8')
      })
    }
  }
}

export function createListDirTool(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool<typeof ListDirParameters> {
  return {
    name: 'list_dir',
    label: 'List Directory',
    description: 'List repository directory entries up to a bounded depth.',
    parameters: ListDirParameters,
    executionMode: 'parallel',
    execute: async (_toolCallId, input) => {
      const access = normalizeRepoToolAccess(accessInput)
      if (access.kind === 'wsl') return executeWslListDir(access, input, options.execFileSync)

      const repoPath = access.displayPath
      const sandbox = createRepoSandbox(repoPath)
      const start = sandbox.resolvePath(input.path)
      const maxDepth = input.depth ?? 1
      const entries: Array<{ path: string; type: 'file' | 'directory' | 'other' }> = []

      const visit = (dir: string, depth: number): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entries.length >= MAX_DIR_ENTRIES) return
          const absolutePath = path.join(dir, entry.name)
          const relativePath = sandbox.assertResolvedPath(absolutePath)
          entries.push({ path: relativePath, type: getDirEntryType(entry) })
          if (entry.isDirectory() && depth < maxDepth) visit(absolutePath, depth + 1)
        }
      }

      visit(start, 0)
      return textResult({ entries, truncated: entries.length >= MAX_DIR_ENTRIES })
    }
  }
}

export function createGlobTool(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool<typeof GlobParameters> {
  return {
    name: 'glob',
    label: 'Glob',
    description: 'Find repository files matching a glob pattern, honoring .gitignore.',
    parameters: GlobParameters,
    executionMode: 'parallel',
    execute: async (_toolCallId, input) => {
      const access = normalizeRepoToolAccess(accessInput)
      if (access.kind === 'wsl') return executeWslGlob(access, input, options.execFileSync)

      const repoPath = access.displayPath
      const sandbox = createRepoSandbox(repoPath)
      sandbox.assertPattern(input.pattern)
      const results = globSync(input.pattern, {
        cwd: sandbox.root,
        dot: true,
        onlyFiles: false,
        followSymbolicLinks: true,
        ignore: loadGitignorePatterns(sandbox.root)
      })
        .map((result) => sandbox.assertResolvedPath(path.join(sandbox.root, result)))
        .slice(0, MAX_GLOB_RESULTS)

      return textResult({ results, truncated: results.length >= MAX_GLOB_RESULTS })
    }
  }
}

export function createGrepTool(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool<typeof GrepParameters> {
  return {
    name: 'grep',
    label: 'Grep',
    description: 'Search repository text with ripgrep.',
    parameters: GrepParameters,
    executionMode: 'parallel',
    execute: async (_toolCallId, input) => {
      const access = normalizeRepoToolAccess(accessInput)
      if (access.kind === 'wsl') return executeWslGrep(access, input, options.execFileSync)

      const repoPath = access.displayPath
      const sandbox = createRepoSandbox(repoPath)
      const searchPath = input.path ? sandbox.resolvePath(input.path) : sandbox.root
      const args = ['--json', '--max-count', '20']
      if (!input.isRegex) args.push('--fixed-strings')
      args.push(input.pattern, searchPath)

      const result = spawnSync(resolveRgPath(), args, {
        cwd: sandbox.root,
        encoding: 'utf8',
        maxBuffer: MAX_GIT_OUTPUT_BYTES
      })
      if (result.error) throw result.error
      if (result.status !== 0 && result.status !== 1) {
        throw new Error(result.stderr || `ripgrep exited with status ${result.status}`)
      }

      const matches: Array<{ path: string; lineNumber: number; lines: string }> = []
      for (const line of result.stdout.split('\n')) {
        if (!line) continue
        const event = JSON.parse(line) as RipgrepEvent
        if (event.type !== 'match') continue
        matches.push({
          path: sandbox.assertResolvedPath(event.data.path.text),
          lineNumber: event.data.line_number,
          lines: String(event.data.lines.text).trimEnd()
        })
        if (matches.length >= MAX_GREP_MATCHES) break
      }

      return textResult({ matches, truncated: matches.length >= MAX_GREP_MATCHES })
    }
  }
}

export function createGitStatusTool(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool {
  return {
    name: 'git_status',
    label: 'Git Status',
    description: 'Return git status for the selected repository.',
    parameters: Type.Object({}),
    executionMode: 'parallel',
    execute: async () => {
      const access = normalizeRepoToolAccess(accessInput)
      if (access.kind === 'wsl') {
        return textResult(
          runWslJson(access, ['git', 'status', '--short', '--branch'], options.execFileSync)
        )
      }

      const repoPath = access.displayPath
      const sandbox = createRepoSandbox(repoPath)
      const status = await simpleGit({ baseDir: sandbox.root }).status()
      return textResult(status)
    }
  }
}

export function createGitDiffTool(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool<typeof GitDiffParameters> {
  return {
    name: 'git_diff',
    label: 'Git Diff',
    description: 'Return a bounded git diff for the selected repository.',
    parameters: GitDiffParameters,
    executionMode: 'parallel',
    execute: async (_toolCallId, input) => {
      const access = normalizeRepoToolAccess(accessInput)
      if (access.kind === 'wsl') return executeWslGitDiff(access, input, options.execFileSync)

      const repoPath = access.displayPath
      const sandbox = createRepoSandbox(repoPath)
      const diffPath = input.path
        ? sandbox.assertResolvedPath(sandbox.resolvePath(input.path))
        : '.'
      const args = ['--no-ext-diff', '--', diffPath]
      if (input.staged) args.unshift('--staged')
      const diff = await simpleGit({ baseDir: sandbox.root }).diff(args)
      return textResult({ diff: truncate(diff, MAX_GIT_OUTPUT_BYTES) })
    }
  }
}

export function createGitLogTool(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool<typeof GitLogParameters> {
  return {
    name: 'git_log',
    label: 'Git Log',
    description: 'Return recent commits for the selected repository or path.',
    parameters: GitLogParameters,
    executionMode: 'parallel',
    execute: async (_toolCallId, input) => {
      const access = normalizeRepoToolAccess(accessInput)
      if (access.kind === 'wsl') return executeWslGitLog(access, input, options.execFileSync)

      const repoPath = access.displayPath
      const sandbox = createRepoSandbox(repoPath)
      const args = [
        'log',
        `--max-count=${input.limit ?? 50}`,
        '--format=%H%x09%an%x09%ad%x09%s',
        '--date=short'
      ]
      if (input.path) args.push('--', sandbox.assertResolvedPath(sandbox.resolvePath(input.path)))
      const output = await simpleGit({ baseDir: sandbox.root }).raw(args)
      const commits: Array<{ hash: string; author: string; date: string; subject: string }> = []
      for (const line of output.trim().split('\n')) {
        if (!line) continue
        const [hash, author, date, ...subjectParts] = line.split('\t')
        commits.push({ hash, author, date, subject: subjectParts.join('\t').slice(0, 200) })
      }
      return textResult({ commits })
    }
  }
}

export function createGitBlameTool(
  accessInput: RepoToolAccess,
  options: RepoToolOptions = {}
): AgentTool<typeof GitBlameParameters> {
  return {
    name: 'git_blame',
    label: 'Git Blame',
    description: 'Return bounded git blame output for a repository file.',
    parameters: GitBlameParameters,
    executionMode: 'parallel',
    execute: async (_toolCallId, input) => {
      const access = normalizeRepoToolAccess(accessInput)
      if (access.kind === 'wsl') return executeWslGitBlame(access, input, options.execFileSync)

      const repoPath = access.displayPath
      const sandbox = createRepoSandbox(repoPath)
      const filePath = sandbox.resolvePath(input.path)
      const relativeFilePath = sandbox.assertResolvedPath(filePath)
      const args = ['blame']
      if (input.lineRange) args.push(`-L${input.lineRange.start},${input.lineRange.end}`)
      args.push('--', relativeFilePath)
      const blame = await simpleGit({ baseDir: sandbox.root }).raw(args)
      return textResult({ blame: truncate(blame, MAX_GIT_OUTPUT_BYTES) })
    }
  }
}

function normalizeRepoToolAccess(accessInput: RepoToolAccess): RepoAccessDescriptor {
  if (typeof accessInput === 'string') return { kind: 'host', displayPath: accessInput }
  return accessInput
}

function executeWslReadFile(
  access: WslRepoAccessDescriptor,
  input: ReadFileParameters,
  runExecFileSync = execFileSync
): ReturnType<typeof textResult> {
  const relativePath = resolveWslRelativePath(access, input.path, runExecFileSync)
  const maxBytes = input.maxBytes ?? MAX_READ_BYTES
  const size = Number(runWsl(access, ['stat', '-c%s', '--', relativePath], runExecFileSync).trim())
  const content = runWslBuffer(
    access,
    ['head', '-c', String(maxBytes), '--', relativePath],
    runExecFileSync
  )
  return textResult({
    path: relativePath,
    truncated: Number.isFinite(size) && size > maxBytes,
    content: content.toString('utf8')
  })
}

function executeWslListDir(
  access: WslRepoAccessDescriptor,
  input: ListDirParameters,
  runExecFileSync = execFileSync
): ReturnType<typeof textResult> {
  const start = resolveWslRelativePath(access, input.path, runExecFileSync)
  const maxDepth = String((input.depth ?? 1) + 1)
  const output = runWsl(
    access,
    ['find', start, '-mindepth', '1', '-maxdepth', maxDepth, '-printf', '%p\t%y\n'],
    runExecFileSync,
    MAX_GIT_OUTPUT_BYTES
  )
  const entries = output
    .split('\n')
    .filter(Boolean)
    .slice(0, MAX_DIR_ENTRIES)
    .map((line) => {
      const [entryPath, kind] = line.split('\t')
      const relativePath = assertWslRelativeAllowed(entryPath ?? '.')
      return {
        path: relativePath,
        type:
          kind === 'd'
            ? ('directory' as const)
            : kind === 'f'
              ? ('file' as const)
              : ('other' as const)
      }
    })
  return textResult({ entries, truncated: entries.length >= MAX_DIR_ENTRIES })
}

function executeWslGlob(
  access: WslRepoAccessDescriptor,
  input: GlobParameters,
  runExecFileSync = execFileSync
): ReturnType<typeof textResult> {
  assertWslGlobPattern(input.pattern)
  const output = runWsl(
    access,
    ['git', 'ls-files', '-co', '--exclude-standard', '-z'],
    runExecFileSync
  )
  const matcher = globPatternToRegExp(input.pattern)
  const results = output
    .split('\0')
    .filter(Boolean)
    .filter((entry) => matcher.test(entry))
    .map((entry) => resolveWslRelativePath(access, entry, runExecFileSync))
    .slice(0, MAX_GLOB_RESULTS)
  return textResult({ results, truncated: results.length >= MAX_GLOB_RESULTS })
}

function executeWslGrep(
  access: WslRepoAccessDescriptor,
  input: GrepParameters,
  runExecFileSync = execFileSync
): ReturnType<typeof textResult> {
  const searchPath = input.path ? resolveWslRelativePath(access, input.path, runExecFileSync) : '.'
  const args = [
    'grep',
    '-r',
    '-n',
    '-I',
    '--exclude=.env',
    '--exclude=.env.*',
    '--exclude-dir=.git',
    '--exclude-dir=node_modules'
  ]
  if (!input.isRegex) args.push('-F')
  args.push('--', input.pattern, searchPath)

  let output = ''
  try {
    output = runWsl(access, args, runExecFileSync, MAX_GIT_OUTPUT_BYTES)
  } catch (error) {
    if (getExecStatus(error) !== 1) throw error
  }

  const matches = output
    .split('\n')
    .filter(Boolean)
    .slice(0, MAX_GREP_MATCHES)
    .map((line) => {
      const [matchPath, lineNumber, ...lineParts] = line.split(':')
      return {
        path: assertWslRelativeAllowed(matchPath ?? '.'),
        lineNumber: Number(lineNumber),
        lines: lineParts.join(':').trimEnd()
      }
    })
  return textResult({ matches, truncated: matches.length >= MAX_GREP_MATCHES })
}

function executeWslGitDiff(
  access: WslRepoAccessDescriptor,
  input: GitDiffParameters,
  runExecFileSync = execFileSync
): ReturnType<typeof textResult> {
  const args = ['git', 'diff', '--no-ext-diff']
  if (input.staged) args.push('--staged')
  args.push('--', input.path ? resolveWslRelativePath(access, input.path, runExecFileSync) : '.')
  const diff = runWsl(access, args, runExecFileSync, MAX_GIT_OUTPUT_BYTES)
  return textResult({ diff: truncate(diff, MAX_GIT_OUTPUT_BYTES) })
}

function executeWslGitLog(
  access: WslRepoAccessDescriptor,
  input: GitLogParameters,
  runExecFileSync = execFileSync
): ReturnType<typeof textResult> {
  const args = [
    'git',
    'log',
    `--max-count=${input.limit ?? 50}`,
    '--format=%H%x09%an%x09%ad%x09%s',
    '--date=short'
  ]
  if (input.path) args.push('--', resolveWslRelativePath(access, input.path, runExecFileSync))
  const output = runWsl(access, args, runExecFileSync, MAX_GIT_OUTPUT_BYTES)
  const commits: Array<{ hash: string; author: string; date: string; subject: string }> = []
  for (const line of output.trim().split('\n')) {
    if (!line) continue
    const [hash, author, date, ...subjectParts] = line.split('\t')
    commits.push({ hash, author, date, subject: subjectParts.join('\t').slice(0, 200) })
  }
  return textResult({ commits })
}

function executeWslGitBlame(
  access: WslRepoAccessDescriptor,
  input: GitBlameParameters,
  runExecFileSync = execFileSync
): ReturnType<typeof textResult> {
  const relativeFilePath = resolveWslRelativePath(access, input.path, runExecFileSync)
  const args = ['git', 'blame']
  if (input.lineRange) args.push(`-L${input.lineRange.start},${input.lineRange.end}`)
  args.push('--', relativeFilePath)
  const blame = runWsl(access, args, runExecFileSync, MAX_GIT_OUTPUT_BYTES)
  return textResult({ blame: truncate(blame, MAX_GIT_OUTPUT_BYTES) })
}

function runWslJson(
  access: WslRepoAccessDescriptor,
  args: string[],
  runExecFileSync = execFileSync
): { output: string } {
  return { output: runWsl(access, args, runExecFileSync, MAX_GIT_OUTPUT_BYTES) }
}

function resolveWslRelativePath(
  access: WslRepoAccessDescriptor,
  inputPath = '.',
  runExecFileSync = execFileSync
): string {
  const lexicalPath = assertWslRelativeAllowed(inputPath)
  const realPath = runWsl(
    access,
    ['realpath', '--relative-to=.', '--', lexicalPath],
    runExecFileSync
  ).trim()
  return assertWslRelativeAllowed(realPath || '.')
}

function assertWslRelativeAllowed(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '') || '.'
  if (path.posix.isAbsolute(normalized)) {
    throw new Error('Tool paths must be relative to the selected repository.')
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.includes('..')) {
    throw new Error('Tool path escapes the selected repository.')
  }

  if (normalized === '.git/objects' || normalized.startsWith('.git/objects/')) {
    throw new Error('Tool path is denied: .git/objects is not readable.')
  }

  if (segments.includes('node_modules')) {
    throw new Error('Tool path is denied: node_modules is not readable.')
  }

  if (segments.some((segment) => segment === '.env' || segment.startsWith('.env.'))) {
    throw new Error('Tool path is denied: .env files are not readable.')
  }

  return normalized
}

function assertWslGlobPattern(pattern: string): void {
  assertWslRelativeAllowed(pattern)
}

function runWsl(
  access: WslRepoAccessDescriptor,
  args: string[],
  runExecFileSync: ExecFileSync,
  maxBuffer = MAX_READ_BYTES
): string {
  return String(runWslBuffer(access, args, runExecFileSync, maxBuffer))
}

function runWslBuffer(
  access: WslRepoAccessDescriptor,
  args: string[],
  runExecFileSync: ExecFileSync,
  maxBuffer = MAX_READ_BYTES
): Buffer {
  return runExecFileSync(
    'wsl.exe',
    ['-d', access.distro, '--cd', access.linuxPath, '--', ...args],
    {
      windowsHide: true,
      timeout: WSL_COMMAND_TIMEOUT_MS,
      maxBuffer
    }
  ) as Buffer
}

function getExecStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('status' in error)) return null
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : null
}

function globPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\0')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\0/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function getDirEntryType(entry: {
  isDirectory(): boolean
  isFile(): boolean
}): 'file' | 'directory' | 'other' {
  if (entry.isDirectory()) return 'directory'
  if (entry.isFile()) return 'file'
  return 'other'
}

export function resolveRgPath(): string {
  if (process.resourcesPath && process.defaultApp !== true) {
    const nodeModulesSegment = `${path.sep}node_modules${path.sep}`
    const nodeModulesIndex = rgPath.lastIndexOf(nodeModulesSegment)
    const relativeBinaryPath =
      nodeModulesIndex >= 0 ? rgPath.slice(nodeModulesIndex + nodeModulesSegment.length) : undefined
    if (relativeBinaryPath) {
      return path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        relativeBinaryPath
      )
    }
  }

  return rgPath
}

function truncate(value: string, maxBytes: number): string {
  const bytes = Buffer.from(value)
  if (bytes.byteLength <= maxBytes) return value
  return `${bytes.subarray(0, maxBytes).toString('utf8')}\n[truncated]`
}

function loadGitignorePatterns(root: string): string[] {
  const gitignorePath = path.join(root, '.gitignore')
  if (!existsSync(gitignorePath)) return []

  const patterns: string[] = []
  for (const line of readFileSync(gitignorePath, 'utf8').split('\n')) {
    const pattern = line.trim()
    if (pattern.length > 0 && !pattern.startsWith('#')) patterns.push(pattern)
  }
  return patterns
}
