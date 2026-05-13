import { describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createReadOnlyRepoTools,
  createGitBlameTool,
  createGitDiffTool,
  createGitLogTool,
  createGitStatusTool,
  createGlobTool,
  createGrepTool,
  createListDirTool,
  createReadFileTool,
  resolveRgPath
} from './repo-tools'

type PathCase = {
  name: string
  execute: (repoPath: string, pathValue: string) => Promise<unknown>
  escapePath: string
  denyPath: string
  symlinkPath: string
}

const pathCases: PathCase[] = [
  {
    name: 'read_file',
    execute: (repoPath, pathValue) =>
      createReadFileTool(repoPath).execute('tool', { path: pathValue }),
    escapePath: '../outside.txt',
    denyPath: '.env.local',
    symlinkPath: 'escape-link.txt'
  },
  {
    name: 'list_dir',
    execute: (repoPath, pathValue) =>
      createListDirTool(repoPath).execute('tool', { path: pathValue }),
    escapePath: '../outside-dir',
    denyPath: 'node_modules',
    symlinkPath: 'escape-dir'
  },
  {
    name: 'glob',
    execute: (repoPath, pathValue) =>
      createGlobTool(repoPath).execute('tool', { pattern: pathValue }),
    escapePath: '../*.txt',
    denyPath: '.env*',
    symlinkPath: 'escape-link.txt'
  },
  {
    name: 'grep',
    execute: (repoPath, pathValue) =>
      createGrepTool(repoPath).execute('tool', { pattern: 'outside', path: pathValue }),
    escapePath: '../outside.txt',
    denyPath: '.env.local',
    symlinkPath: 'escape-link.txt'
  },
  {
    name: 'git_diff',
    execute: (repoPath, pathValue) =>
      createGitDiffTool(repoPath).execute('tool', { path: pathValue }),
    escapePath: '../outside.txt',
    denyPath: '.git/objects',
    symlinkPath: 'escape-link.txt'
  },
  {
    name: 'git_log',
    execute: (repoPath, pathValue) =>
      createGitLogTool(repoPath).execute('tool', { path: pathValue }),
    escapePath: '../outside.txt',
    denyPath: 'node_modules/blocked.txt',
    symlinkPath: 'escape-link.txt'
  },
  {
    name: 'git_blame',
    execute: (repoPath, pathValue) =>
      createGitBlameTool(repoPath).execute('tool', { path: pathValue }),
    escapePath: '../outside.txt',
    denyPath: '.env.local',
    symlinkPath: 'escape-link.txt'
  }
]

describe('read-only repo tools', () => {
  for (const testCase of pathCases) {
    it(`${testCase.name} rejects path escape, denylist hits, and symlink escape`, async () => {
      const { repoPath } = createFixtureRepo()

      await expect(testCase.execute(repoPath, testCase.escapePath)).rejects.toThrow(
        /escape|relative/
      )
      await expect(testCase.execute(repoPath, testCase.denyPath)).rejects.toThrow(/denied/)
      await expect(testCase.execute(repoPath, testCase.symlinkPath)).rejects.toThrow(/escapes/)
    })
  }

  it('git_status executes against the selected repository', async () => {
    const { repoPath } = createFixtureRepo()

    const result = await createGitStatusTool(repoPath).execute('tool', {})

    expect(result.details).toMatchObject({ current: 'main' })
  })

  it('reads WSL repository files through wsl.exe argument arrays', async () => {
    const mockExecFileSync = vi.fn((file: string, args: string[]) => {
      expect(file).toBe('wsl.exe')
      expect(args.slice(0, 5)).toEqual([
        '-d',
        'Ubuntu',
        '--cd',
        '/home/neely/dev/pi log;rm -rf nope',
        '--'
      ])

      const command = args[5]
      if (command === 'realpath') return Buffer.from('src/app.ts\n')
      if (command === 'stat') return Buffer.from('17\n')
      if (command === 'head') return Buffer.from('export const app\n')
      throw new Error(`Unexpected command: ${command}`)
    })
    const tools = createReadOnlyRepoTools(wslAccess(), {
      execFileSync: mockExecFileSync as unknown as typeof execFileSync
    })
    const readFile = tools.find((tool) => tool.name === 'read_file')

    const result = await readFile!.execute('tool', { path: 'src/app.ts' })

    expect(result.details).toEqual({
      path: 'src/app.ts',
      truncated: false,
      content: 'export const app\n'
    })
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'wsl.exe',
      [
        '-d',
        'Ubuntu',
        '--cd',
        '/home/neely/dev/pi log;rm -rf nope',
        '--',
        'realpath',
        '--relative-to=.',
        '--',
        'src/app.ts'
      ],
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('runs WSL read-only tools without shell-concatenating repository paths', async () => {
    const mockExecFileSync = vi.fn((_file: string, args: string[]) => {
      const command = args[5]
      if (command === 'realpath') return Buffer.from(`${args.at(-1)}\n`)
      if (command === 'find') return Buffer.from('src/app.ts\tf\nsrc\td\n')
      if (command === 'git' && args[6] === 'ls-files') return Buffer.from('src/app.ts\0')
      if (command === 'grep') return Buffer.from('src/app.ts:1:export const app = true\n')
      if (command === 'git' && args[6] === 'status') return Buffer.from('## main\n M src/app.ts\n')
      if (command === 'git' && args[6] === 'diff')
        return Buffer.from('diff --git a/src/app.ts b/src/app.ts\n')
      if (command === 'git' && args[6] === 'log') {
        return Buffer.from('abc\tPilog\t2026-05-13\tInitial commit\n')
      }
      if (command === 'git' && args[6] === 'blame')
        return Buffer.from('abc (Pilog 2026-05-13 1) line\n')
      throw new Error(`Unexpected command: ${args.join(' ')}`)
    })
    const access = wslAccess()

    const options = { execFileSync: mockExecFileSync as unknown as typeof execFileSync }

    await createListDirTool(access, options).execute('tool', { path: 'src', depth: 1 })
    await createGlobTool(access, options).execute('tool', { pattern: 'src/*.ts' })
    await createGrepTool(access, options).execute('tool', { pattern: 'app', path: 'src' })
    await createGitStatusTool(access, options).execute('tool', {})
    await createGitDiffTool(access, options).execute('tool', { path: 'src/app.ts' })
    await createGitLogTool(access, options).execute('tool', { path: 'src/app.ts' })
    await createGitBlameTool(access, options).execute('tool', { path: 'src/app.ts' })

    for (const call of mockExecFileSync.mock.calls) {
      expect(call[0]).toBe('wsl.exe')
      expect(call[1]).toContain('/home/neely/dev/pi log;rm -rf nope')
    }
  })

  it('keeps WSL sandbox protections for traversal, denied paths, and symlink escapes', async () => {
    const mockExecFileSync = vi.fn((_file: string, args: string[]) => {
      if (args[5] === 'git' && args[6] === 'ls-files') {
        return Buffer.from('.env.local\0escape-link.txt\0')
      }
      if (args[5] === 'realpath' && args.at(-1) === 'escape-link.txt') {
        return Buffer.from('../outside.txt\n')
      }
      return Buffer.from(`${args.at(-1)}\n`)
    })
    const access = wslAccess()
    const options = { execFileSync: mockExecFileSync as unknown as typeof execFileSync }

    await expect(
      createReadFileTool(access, options).execute('tool', { path: '../x' })
    ).rejects.toThrow(/escapes/)
    await expect(
      createReadFileTool(access, options).execute('tool', { path: '.env.local' })
    ).rejects.toThrow(/denied/)
    await expect(
      createReadFileTool(access, options).execute('tool', { path: 'escape-link.txt' })
    ).rejects.toThrow(/escapes/)
    await expect(
      createGlobTool(access, options).execute('tool', { pattern: '../*' })
    ).rejects.toThrow(/escapes/)
    await expect(
      createGlobTool(access, options).execute('tool', { pattern: '.env*' })
    ).rejects.toThrow(/denied/)
    await expect(
      createGlobTool(access, options).execute('tool', { pattern: 'escape-link.txt' })
    ).rejects.toThrow(/escapes/)
  })

  it('resolves the ripgrep binary from app.asar.unpacked in packaged builds', () => {
    const originalResourcesPath = process.resourcesPath
    const originalDefaultApp = process.defaultApp

    Object.defineProperty(process, 'resourcesPath', {
      configurable: true,
      value: '/tmp/pilog/resources'
    })
    Object.defineProperty(process, 'defaultApp', { configurable: true, value: false })

    try {
      expect(resolveRgPath()).toContain('/tmp/pilog/resources/app.asar.unpacked/node_modules/')
      expect(resolveRgPath()).toContain('@vscode/ripgrep')
      expect(resolveRgPath()).toMatch(/bin\/rg$/)
    } finally {
      Object.defineProperty(process, 'resourcesPath', {
        configurable: true,
        value: originalResourcesPath
      })
      Object.defineProperty(process, 'defaultApp', {
        configurable: true,
        value: originalDefaultApp
      })
    }
  })
})

function wslAccess(): {
  kind: 'wsl'
  displayPath: string
  distro: string
  linuxPath: string
} {
  return {
    kind: 'wsl' as const,
    displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pi log;rm -rf nope',
    distro: 'Ubuntu',
    linuxPath: '/home/neely/dev/pi log;rm -rf nope'
  }
}

function createFixtureRepo(): { repoPath: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'pilog-tools-'))
  const repoPath = path.join(root, 'repo')
  const outsidePath = path.join(root, 'outside.txt')
  const outsideDir = path.join(root, 'outside-dir')

  mkdirSync(repoPath)
  mkdirSync(outsideDir)
  mkdirSync(path.join(repoPath, 'src'))
  mkdirSync(path.join(repoPath, 'node_modules'), { recursive: true })
  writeFileSync(path.join(repoPath, 'src', 'app.ts'), 'export const app = true\n')
  writeFileSync(path.join(repoPath, '.env.local'), 'TOKEN=secret\n')
  writeFileSync(path.join(repoPath, 'node_modules', 'blocked.txt'), 'blocked\n')
  writeFileSync(outsidePath, 'outside\n')
  symlinkSync(outsidePath, path.join(repoPath, 'escape-link.txt'))
  symlinkSync(outsideDir, path.join(repoPath, 'escape-dir'), 'dir')

  execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.email', 'pilog@example.com'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.name', 'Pilog'], { cwd: repoPath })
  execFileSync('git', ['add', 'src/app.ts'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath })

  return { repoPath }
}
