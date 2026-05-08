import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
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
  execFileSync('git', ['config', 'user.name', 'PiLog'], { cwd: repoPath })
  execFileSync('git', ['add', 'src/app.ts'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoPath })

  return { repoPath }
}
