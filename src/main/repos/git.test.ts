import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  readLocalGitMetadata,
  isGitRepo,
  parseRepoAccessDescriptor,
  readGitMetadata,
  readGitMetadataResult,
  readGitCaptureContext
} from './git'

describe('readLocalGitMetadata', () => {
  let repoDir: string
  let emptyDir: string

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'pilog-test-repo-'))
    execSync('git init', { cwd: repoDir })
    execSync('git config user.email "test@test.com"', { cwd: repoDir })
    execSync('git config user.name "Test"', { cwd: repoDir })
    writeFileSync(join(repoDir, 'README.md'), '# Test')
    execSync('git add .', { cwd: repoDir })
    execSync('git commit -m "init"', { cwd: repoDir })
    execSync('git remote add origin https://github.com/owner/repo.git', { cwd: repoDir })

    emptyDir = mkdtempSync(join(tmpdir(), 'pilog-test-empty-'))
  })

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true })
    rmSync(emptyDir, { recursive: true, force: true })
  })

  it('returns null for a non-git directory', async () => {
    const result = await readLocalGitMetadata(emptyDir)
    expect(result).toBeNull()
  })

  it('returns metadata for a git repo with a remote', async () => {
    const result = await readLocalGitMetadata(repoDir)
    expect(result).not.toBeNull()
    expect(result!.remoteUrl).toBe('https://github.com/owner/repo.git')
    expect(result!.headSha).toMatch(/^[0-9a-f]{40}$/)
    expect(result!.defaultBranch).toMatch(/\S+/)
  })

  it('isGitRepo returns true for a git repo', async () => {
    expect(await isGitRepo(repoDir)).toBe(true)
  })

  it('isGitRepo returns false for a non-git directory', async () => {
    expect(await isGitRepo(emptyDir)).toBe(false)
  })

  it('returns null for a git repo with no remote', async () => {
    const noRemoteDir = mkdtempSync(join(tmpdir(), 'pilog-test-noremote-'))
    try {
      execSync('git init', { cwd: noRemoteDir })
      execSync('git config user.email "test@test.com"', { cwd: noRemoteDir })
      execSync('git config user.name "Test"', { cwd: noRemoteDir })
      writeFileSync(join(noRemoteDir, 'file.txt'), 'hello')
      execSync('git add .', { cwd: noRemoteDir })
      execSync('git commit -m "init"', { cwd: noRemoteDir })

      const result = await readLocalGitMetadata(noRemoteDir)
      expect(result).toBeNull()
    } finally {
      rmSync(noRemoteDir, { recursive: true, force: true })
    }
  })
})

describe('parseRepoAccessDescriptor', () => {
  it('parses wsl.localhost UNC paths into a WSL descriptor', () => {
    expect(
      parseRepoAccessDescriptor('\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pi log')
    ).toEqual({
      kind: 'wsl',
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pi log',
      distro: 'Ubuntu',
      linuxPath: '/home/neely/dev/pi log'
    })
  })

  it('parses legacy wsl$ UNC paths and preserves shell-sensitive characters', () => {
    expect(parseRepoAccessDescriptor('\\\\wsl$\\Ubuntu-22.04\\home\\n\\dev\\semi;colon')).toEqual({
      kind: 'wsl',
      displayPath: '\\\\wsl$\\Ubuntu-22.04\\home\\n\\dev\\semi;colon',
      distro: 'Ubuntu-22.04',
      linuxPath: '/home/n/dev/semi;colon'
    })
  })

  it('leaves host-local paths as host descriptors', () => {
    expect(parseRepoAccessDescriptor('/home/neely/dev/pilog')).toEqual({
      kind: 'host',
      displayPath: '/home/neely/dev/pilog'
    })
    expect(parseRepoAccessDescriptor('C:\\Users\\neely\\dev\\pilog')).toEqual({
      kind: 'host',
      displayPath: 'C:\\Users\\neely\\dev\\pilog'
    })
  })
})

describe('readGitMetadata', () => {
  it('uses wsl.exe with argument arrays for WSL Git metadata reads', async () => {
    const execFile = vi.fn(async (_file: string, args: string[]) => {
      const gitArgs = args.slice(args.indexOf('git') + 1)
      if (gitArgs.join(' ') === 'rev-parse --is-inside-work-tree') {
        return { stdout: 'true\n', stderr: '' }
      }
      if (gitArgs.join(' ') === 'remote get-url origin') {
        return { stdout: 'https://github.com/nick-neely/pilog.git\n', stderr: '' }
      }
      if (gitArgs.join(' ') === 'rev-parse HEAD') {
        return { stdout: 'deadbeef\n', stderr: '' }
      }
      if (gitArgs.join(' ') === 'rev-parse --abbrev-ref HEAD') {
        return { stdout: 'main\n', stderr: '' }
      }
      throw new Error(`unexpected git args: ${gitArgs.join(' ')}`)
    })

    const metadata = await readGitMetadata(
      {
        kind: 'wsl',
        displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\n\\dev\\pi log;rm -rf nope',
        distro: 'Ubuntu',
        linuxPath: '/home/n/dev/pi log;rm -rf nope'
      },
      { execFile }
    )

    expect(metadata).toEqual({
      remoteUrl: 'https://github.com/nick-neely/pilog.git',
      defaultBranch: 'main',
      headSha: 'deadbeef'
    })
    expect(execFile).toHaveBeenCalledWith('wsl.exe', [
      '-d',
      'Ubuntu',
      '--cd',
      '/home/n/dev/pi log;rm -rf nope',
      '--',
      'git',
      'rev-parse',
      '--is-inside-work-tree'
    ])
  })

  it('classifies WSL prerequisite and repository failures precisely', async () => {
    const access = {
      kind: 'wsl' as const,
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\n\\missing',
      distro: 'Ubuntu',
      linuxPath: '/home/n/missing'
    }

    const cases = [
      {
        stderr: 'The system cannot find the file specified',
        code: 'ENOENT',
        reason: 'wsl-unavailable'
      },
      {
        stderr: 'There is no distribution with the supplied name.',
        code: undefined,
        reason: 'distro-unavailable'
      },
      {
        stderr: 'execvpe(/usr/bin/git) failed: No such file or directory',
        code: undefined,
        reason: 'git-missing'
      },
      {
        stderr: 'The directory name is invalid.',
        code: undefined,
        reason: 'path-missing'
      },
      {
        stderr: 'fatal: not a git repository (or any of the parent directories): .git',
        code: undefined,
        reason: 'not-git'
      }
    ] as const

    for (const item of cases) {
      const execFile = vi.fn(async () => {
        const error = new Error(item.stderr) as Error & { stderr: string; code?: string }
        error.stderr = item.stderr
        error.code = item.code
        throw error
      })

      await expect(readGitMetadataResult(access, { execFile })).resolves.toEqual({
        state: 'wsl-failure',
        reason: item.reason,
        access
      })
    }
  })

  it('classifies a WSL repo with no origin remote separately from a non-repo', async () => {
    const access = {
      kind: 'wsl' as const,
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\n\\dev\\pilog',
      distro: 'Ubuntu',
      linuxPath: '/home/n/dev/pilog'
    }
    const execFile = vi.fn(async (_file: string, args: string[]) => {
      const gitArgs = args.slice(args.indexOf('git') + 1)
      if (gitArgs.join(' ') === 'rev-parse --is-inside-work-tree') {
        return { stdout: 'true\n', stderr: '' }
      }
      const error = new Error("fatal: No such remote 'origin'") as Error & { stderr: string }
      error.stderr = "fatal: No such remote 'origin'"
      throw error
    })

    await expect(readGitMetadataResult(access, { execFile })).resolves.toEqual({
      state: 'wsl-failure',
      reason: 'no-origin',
      access
    })
  })
})

describe('readGitCaptureContext', () => {
  let repoDir: string

  beforeAll(() => {
    repoDir = mkdtempSync(join(tmpdir(), 'pilog-capture-context-'))
    execSync('git init', { cwd: repoDir })
    execSync('git config user.email "test@test.com"', { cwd: repoDir })
    execSync('git config user.name "Test"', { cwd: repoDir })
    writeFileSync(join(repoDir, 'README.md'), '# Test\n')
    execSync('git add README.md', { cwd: repoDir })
    execSync('git commit -m "capture baseline"', { cwd: repoDir })
    writeFileSync(join(repoDir, 'README.md'), '# Changed\n')
    writeFileSync(join(repoDir, 'staged.txt'), 'staged\n')
    execSync('git add staged.txt', { cwd: repoDir })
  })

  afterAll(() => {
    rmSync(repoDir, { recursive: true, force: true })
  })

  it('captures branch, working tree paths, and HEAD metadata for a host repo', async () => {
    const result = await readGitCaptureContext({ kind: 'host', displayPath: repoDir })

    expect(result.state).toBe('captured')
    if (result.state !== 'captured') return
    expect(result.branch).toMatch(/\S+/)
    expect(result.dirtyFiles).toEqual(['README.md'])
    expect(result.stagedFiles).toEqual(['staged.txt'])
    expect(result.headSha).toMatch(/^[0-9a-f]{40}$/)
    expect(result.headSubject).toBe('capture baseline')
    expect(result.diffSummary).toBeUndefined()
    expect(result.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('captures a structured diff summary only when explicitly enabled', async () => {
    const result = await readGitCaptureContext(
      { kind: 'host', displayPath: repoDir },
      { includeDiffSummary: true }
    )

    expect(result.state).toBe('captured')
    if (result.state !== 'captured') return
    expect(result.diffSummary).toEqual({
      filesChanged: 2,
      insertions: 2,
      deletions: 1
    })
  })

  it('returns unavailable Capture Context when git metadata cannot be read', async () => {
    const result = await readGitCaptureContext({ kind: 'host', displayPath: '/missing/pilog' })

    expect(result).toEqual({
      state: 'unavailable',
      capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    })
  })
})
