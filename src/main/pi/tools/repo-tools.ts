import type { AgentTool } from '@earendil-works/pi-agent-core'
import { rgPath } from '@vscode/ripgrep'
import { Type } from 'typebox'
import { existsSync, statSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import simpleGit from 'simple-git'
import { globSync } from 'tinyglobby'
import { createRepoSandbox } from './sandbox'

const MAX_READ_BYTES = 256 * 1024
const MAX_DIR_ENTRIES = 500
const MAX_GLOB_RESULTS = 500
const MAX_GREP_MATCHES = 200
const MAX_GIT_OUTPUT_BYTES = 256 * 1024

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

export function createReadOnlyRepoTools(repoPath: string): AgentTool[] {
  return [
    createReadFileTool(repoPath),
    createListDirTool(repoPath),
    createGlobTool(repoPath),
    createGrepTool(repoPath),
    createGitStatusTool(repoPath),
    createGitDiffTool(repoPath),
    createGitLogTool(repoPath),
    createGitBlameTool(repoPath)
  ]
}

export function createReadFileTool(repoPath: string): AgentTool {
  return {
    name: 'read_file',
    label: 'Read File',
    description: 'Read a UTF-8 text file from the selected repository.',
    parameters: Type.Object({
      path: Type.String(),
      maxBytes: Type.Optional(Type.Number({ minimum: 1, maximum: MAX_READ_BYTES }))
    }),
    executionMode: 'parallel',
    execute: async (_toolCallId, params: unknown) => {
      const input = params as { path: string; maxBytes?: number }
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

export function createListDirTool(repoPath: string): AgentTool {
  return {
    name: 'list_dir',
    label: 'List Directory',
    description: 'List repository directory entries up to a bounded depth.',
    parameters: Type.Object({
      path: Type.String(),
      depth: Type.Optional(Type.Number({ minimum: 0, maximum: 4 }))
    }),
    executionMode: 'parallel',
    execute: async (_toolCallId, params: unknown) => {
      const input = params as { path: string; depth?: number }
      const sandbox = createRepoSandbox(repoPath)
      const start = sandbox.resolvePath(input.path)
      const maxDepth = input.depth ?? 1
      const entries: Array<{ path: string; type: 'file' | 'directory' | 'other' }> = []

      const visit = (dir: string, depth: number): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entries.length >= MAX_DIR_ENTRIES) return
          const absolutePath = path.join(dir, entry.name)
          const relativePath = sandbox.assertResolvedPath(absolutePath)
          const type = entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other'
          entries.push({ path: relativePath, type })
          if (entry.isDirectory() && depth < maxDepth) visit(absolutePath, depth + 1)
        }
      }

      visit(start, 0)
      return textResult({ entries, truncated: entries.length >= MAX_DIR_ENTRIES })
    }
  }
}

export function createGlobTool(repoPath: string): AgentTool {
  return {
    name: 'glob',
    label: 'Glob',
    description: 'Find repository files matching a glob pattern, honoring .gitignore.',
    parameters: Type.Object({ pattern: Type.String() }),
    executionMode: 'parallel',
    execute: async (_toolCallId, params: unknown) => {
      const input = params as { pattern: string }
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

export function createGrepTool(repoPath: string): AgentTool {
  return {
    name: 'grep',
    label: 'Grep',
    description: 'Search repository text with ripgrep.',
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
      isRegex: Type.Optional(Type.Boolean())
    }),
    executionMode: 'parallel',
    execute: async (_toolCallId, params: unknown) => {
      const input = params as { pattern: string; path?: string; isRegex?: boolean }
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

      const matches = result.stdout
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RipgrepEvent)
        .filter((event) => event.type === 'match')
        .map((event) => ({
          path: sandbox.assertResolvedPath(event.data.path.text),
          lineNumber: event.data.line_number,
          lines: String(event.data.lines.text).trimEnd()
        }))
        .slice(0, MAX_GREP_MATCHES)

      return textResult({ matches, truncated: matches.length >= MAX_GREP_MATCHES })
    }
  }
}

export function createGitStatusTool(repoPath: string): AgentTool {
  return {
    name: 'git_status',
    label: 'Git Status',
    description: 'Return git status for the selected repository.',
    parameters: Type.Object({}),
    executionMode: 'parallel',
    execute: async () => {
      const sandbox = createRepoSandbox(repoPath)
      const status = await simpleGit({ baseDir: sandbox.root }).status()
      return textResult(status)
    }
  }
}

export function createGitDiffTool(repoPath: string): AgentTool {
  return {
    name: 'git_diff',
    label: 'Git Diff',
    description: 'Return a bounded git diff for the selected repository.',
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
      staged: Type.Optional(Type.Boolean())
    }),
    executionMode: 'parallel',
    execute: async (_toolCallId, params: unknown) => {
      const input = params as { path?: string; staged?: boolean }
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

export function createGitLogTool(repoPath: string): AgentTool {
  return {
    name: 'git_log',
    label: 'Git Log',
    description: 'Return recent commits for the selected repository or path.',
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 }))
    }),
    executionMode: 'parallel',
    execute: async (_toolCallId, params: unknown) => {
      const input = params as { path?: string; limit?: number }
      const sandbox = createRepoSandbox(repoPath)
      const args = [
        'log',
        `--max-count=${input.limit ?? 50}`,
        '--format=%H%x09%an%x09%ad%x09%s',
        '--date=short'
      ]
      if (input.path) args.push('--', sandbox.assertResolvedPath(sandbox.resolvePath(input.path)))
      const output = await simpleGit({ baseDir: sandbox.root }).raw(args)
      const commits = output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [hash, author, date, ...subjectParts] = line.split('\t')
          return { hash, author, date, subject: subjectParts.join('\t').slice(0, 200) }
        })
      return textResult({ commits })
    }
  }
}

export function createGitBlameTool(repoPath: string): AgentTool {
  return {
    name: 'git_blame',
    label: 'Git Blame',
    description: 'Return bounded git blame output for a repository file.',
    parameters: Type.Object({
      path: Type.String(),
      lineRange: Type.Optional(
        Type.Object({
          start: Type.Number({ minimum: 1 }),
          end: Type.Number({ minimum: 1 })
        })
      )
    }),
    executionMode: 'parallel',
    execute: async (_toolCallId, params: unknown) => {
      const input = params as { path: string; lineRange?: { start: number; end: number } }
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

  return readFileSync(gitignorePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
}
