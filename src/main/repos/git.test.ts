import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import { tmpdir } from 'os'
import { readLocalGitMetadata, isGitRepo } from './git'

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
