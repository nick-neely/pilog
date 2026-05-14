import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createInMemoryDatabase, type PilogDatabase } from '../db/client'
import { runMigrations } from '../db/migrations'
import { listRepos as listDbRepos } from '../db/repositories/repos'
import type { GitHubRepo } from '@shared/ipc'

vi.mock('./git', () => ({
  isGitRepo: vi.fn(),
  readLocalGitMetadata: vi.fn(),
  parseRepoAccessDescriptor: vi.fn((localPath: string) => ({
    kind: 'host',
    displayPath: localPath
  })),
  readGitMetadataResult: vi.fn(),
  parseGitHubOwnerRepo: vi.fn()
}))

vi.mock('../github/client', () => ({
  getOctokitClient: vi.fn(),
  listRepos: vi.fn(),
  listLabels: vi.fn()
}))

vi.mock('../runtime-readiness', () => ({
  REPO_LINK_RUNTIME_REQUIREMENTS: ['git', 'keychain'],
  getRuntimeReadiness: vi.fn(),
  getBlockingRuntimeReadinessMessage: vi.fn()
}))

const mockGitHubRepo: GitHubRepo = {
  id: 1,
  name: 'pilog',
  owner: 'nick-neely',
  fullName: 'nick-neely/pilog',
  url: 'https://github.com/nick-neely/pilog',
  defaultBranch: 'main'
}

describe('local-repo-service', () => {
  let db: PilogDatabase
  let gitMock: {
    isGitRepo: ReturnType<typeof vi.fn>
    readLocalGitMetadata: ReturnType<typeof vi.fn>
    parseRepoAccessDescriptor: ReturnType<typeof vi.fn>
    readGitMetadataResult: ReturnType<typeof vi.fn>
    parseGitHubOwnerRepo: ReturnType<typeof vi.fn>
  }
  let clientMock: {
    getOctokitClient: ReturnType<typeof vi.fn>
    listRepos: ReturnType<typeof vi.fn>
    listLabels: ReturnType<typeof vi.fn>
  }
  let readinessMock: {
    getRuntimeReadiness: ReturnType<typeof vi.fn>
    getBlockingRuntimeReadinessMessage: ReturnType<typeof vi.fn>
  }
  let service: typeof import('./local-repo-service')

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    db = createInMemoryDatabase()
    runMigrations(db)

    gitMock = (await import('./git')) as unknown as typeof gitMock
    clientMock = (await import('../github/client')) as unknown as typeof clientMock
    readinessMock = (await import('../runtime-readiness')) as unknown as typeof readinessMock
    gitMock.parseRepoAccessDescriptor.mockImplementation((localPath: string) => ({
      kind: 'host',
      displayPath: localPath
    }))
    readinessMock.getRuntimeReadiness.mockResolvedValue({ ready: true, items: {} })
    readinessMock.getBlockingRuntimeReadinessMessage.mockReturnValue(null)
    service = await import('./local-repo-service')
  })

  describe('detectLocalRepo', () => {
    it('returns runtime-blocked when shared readiness has a blocking prerequisite', async () => {
      readinessMock.getBlockingRuntimeReadinessMessage.mockReturnValue(
        'Git needs attention. Git is not available to Pilog. Install Git.'
      )

      const result = await service.detectLocalRepo('/some/path')

      expect(result).toEqual({
        state: 'runtime-blocked',
        message: 'Git needs attention. Git is not available to Pilog. Install Git.',
        recoveryAction: 'Open Settings and follow the runtime readiness recovery action.'
      })
      expect(gitMock.isGitRepo).not.toHaveBeenCalled()
    })

    it('returns unauthenticated when no GitHub client', async () => {
      clientMock.getOctokitClient.mockReturnValue(null)

      const result = await service.detectLocalRepo('/some/path')
      expect(result).toEqual({ state: 'unauthenticated' })
    })

    it('returns not-git for a non-git directory', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.isGitRepo.mockResolvedValue(false)

      const result = await service.detectLocalRepo('/not/a/git/dir')
      expect(result).toEqual({ state: 'not-git' })
    })

    it('returns no-remote when git repo has no origin', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.isGitRepo.mockResolvedValue(true)
      gitMock.readLocalGitMetadata.mockResolvedValue(null)

      const result = await service.detectLocalRepo('/git/repo/no/remote')
      expect(result).toEqual({ state: 'no-remote' })
    })

    it('returns unmatched when remote does not match any GitHub repo', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.isGitRepo.mockResolvedValue(true)
      gitMock.readLocalGitMetadata.mockResolvedValue({
        remoteUrl: 'https://github.com/other/project.git',
        defaultBranch: 'main',
        headSha: 'abc123'
      })
      gitMock.parseGitHubOwnerRepo.mockReturnValue({ owner: 'other', name: 'project' })
      clientMock.listRepos.mockResolvedValue([mockGitHubRepo])

      const result = await service.detectLocalRepo('/some/path')
      expect(result).toEqual({
        state: 'unmatched',
        remoteUrl: 'https://github.com/other/project.git'
      })
    })

    it('returns unmatched for a non-GitHub remote URL', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.isGitRepo.mockResolvedValue(true)
      gitMock.readLocalGitMetadata.mockResolvedValue({
        remoteUrl: 'https://bitbucket.org/owner/repo.git',
        defaultBranch: 'main',
        headSha: 'abc123'
      })
      gitMock.parseGitHubOwnerRepo.mockReturnValue(null)
      clientMock.listRepos.mockResolvedValue([mockGitHubRepo])

      const result = await service.detectLocalRepo('/some/path')
      expect(result).toEqual({
        state: 'unmatched',
        remoteUrl: 'https://bitbucket.org/owner/repo.git'
      })
    })

    it('returns matched when remote matches a GitHub repo', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.isGitRepo.mockResolvedValue(true)
      gitMock.readLocalGitMetadata.mockResolvedValue({
        remoteUrl: 'https://github.com/nick-neely/pilog.git',
        defaultBranch: 'main',
        headSha: 'deadbeef1234'
      })
      gitMock.parseGitHubOwnerRepo.mockReturnValue({ owner: 'nick-neely', name: 'pilog' })
      clientMock.listRepos.mockResolvedValue([mockGitHubRepo])

      const result = await service.detectLocalRepo('/projects/pilog')
      expect(result).toEqual({
        state: 'matched',
        remoteUrl: 'https://github.com/nick-neely/pilog.git',
        defaultBranch: 'main',
        headSha: 'deadbeef1234',
        githubRepo: mockGitHubRepo,
        access: { kind: 'host', displayPath: '/projects/pilog' }
      })
    })

    it('routes WSL paths through WSL-aware metadata reads before GitHub matching', async () => {
      const access = {
        kind: 'wsl' as const,
        displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
        distro: 'Ubuntu',
        linuxPath: '/home/neely/dev/pilog'
      }
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.parseRepoAccessDescriptor.mockReturnValue(access)
      gitMock.readGitMetadataResult.mockResolvedValue({
        state: 'metadata',
        metadata: {
          remoteUrl: 'https://github.com/nick-neely/pilog.git',
          defaultBranch: 'main',
          headSha: 'wslhead'
        }
      })
      gitMock.parseGitHubOwnerRepo.mockReturnValue({ owner: 'nick-neely', name: 'pilog' })
      clientMock.listRepos.mockResolvedValue([mockGitHubRepo])

      const result = await service.detectLocalRepo(access.displayPath)

      expect(gitMock.isGitRepo).not.toHaveBeenCalled()
      expect(gitMock.readLocalGitMetadata).not.toHaveBeenCalled()
      expect(gitMock.readGitMetadataResult).toHaveBeenCalledWith(access)
      expect(result).toEqual({
        state: 'matched',
        remoteUrl: 'https://github.com/nick-neely/pilog.git',
        defaultBranch: 'main',
        headSha: 'wslhead',
        githubRepo: mockGitHubRepo,
        access
      })
    })

    it('returns a precise WSL failure when Git is missing inside the selected distro', async () => {
      const access = {
        kind: 'wsl' as const,
        displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
        distro: 'Ubuntu',
        linuxPath: '/home/neely/dev/pilog'
      }
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.parseRepoAccessDescriptor.mockReturnValue(access)
      gitMock.readGitMetadataResult.mockResolvedValue({
        state: 'wsl-failure',
        reason: 'git-missing',
        access
      })

      const result = await service.detectLocalRepo(access.displayPath)

      expect(result).toEqual({
        state: 'wsl-failure',
        reason: 'git-missing',
        access
      })
      expect(gitMock.isGitRepo).not.toHaveBeenCalled()
      expect(clientMock.listRepos).not.toHaveBeenCalled()
    })

    it('returns a precise WSL failure when the WSL repo has no origin', async () => {
      const access = {
        kind: 'wsl' as const,
        displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
        distro: 'Ubuntu',
        linuxPath: '/home/neely/dev/pilog'
      }
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.parseRepoAccessDescriptor.mockReturnValue(access)
      gitMock.readGitMetadataResult.mockResolvedValue({
        state: 'wsl-failure',
        reason: 'no-origin',
        access
      })

      await expect(service.detectLocalRepo(access.displayPath)).resolves.toEqual({
        state: 'wsl-failure',
        reason: 'no-origin',
        access
      })
      expect(clientMock.listRepos).not.toHaveBeenCalled()
    })

    it('returns a WSL unmatched failure when the WSL origin is not visible to GitHub', async () => {
      const access = {
        kind: 'wsl' as const,
        displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
        distro: 'Ubuntu',
        linuxPath: '/home/neely/dev/pilog'
      }
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.parseRepoAccessDescriptor.mockReturnValue(access)
      gitMock.readGitMetadataResult.mockResolvedValue({
        state: 'metadata',
        metadata: {
          remoteUrl: 'https://github.com/other/project.git',
          defaultBranch: 'main',
          headSha: 'wslhead'
        }
      })
      gitMock.parseGitHubOwnerRepo.mockReturnValue({ owner: 'other', name: 'project' })
      clientMock.listRepos.mockResolvedValue([mockGitHubRepo])

      await expect(service.detectLocalRepo(access.displayPath)).resolves.toEqual({
        state: 'wsl-failure',
        reason: 'unmatched',
        access,
        remoteUrl: 'https://github.com/other/project.git'
      })
    })

    it('matches case-insensitively', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      gitMock.isGitRepo.mockResolvedValue(true)
      gitMock.readLocalGitMetadata.mockResolvedValue({
        remoteUrl: 'https://github.com/NICK-NEELY/PILOG.git',
        defaultBranch: 'main',
        headSha: 'abc'
      })
      gitMock.parseGitHubOwnerRepo.mockReturnValue({ owner: 'NICK-NEELY', name: 'PILOG' })
      clientMock.listRepos.mockResolvedValue([mockGitHubRepo])

      const result = await service.detectLocalRepo('/projects/pilog')
      expect(result.state).toBe('matched')
    })
  })

  describe('linkRepo', () => {
    it('rejects when shared readiness has a blocking prerequisite', async () => {
      readinessMock.getBlockingRuntimeReadinessMessage.mockReturnValue(
        'Keychain needs attention. Secure credential storage is unavailable.'
      )

      await expect(
        service.linkRepo(db, {
          localPath: '/projects/pilog',
          githubRepo: mockGitHubRepo,
          defaultBranch: 'main'
        })
      ).rejects.toThrow('Keychain needs attention')
      expect(clientMock.listLabels).not.toHaveBeenCalled()
    })

    it('persists a repo row with GitHub labels and returns the Repo', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      clientMock.listLabels.mockResolvedValue([
        { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' },
        { id: 2, name: 'ready-for-agent', color: '0e8a16', description: null }
      ])

      const repo = await service.linkRepo(db, {
        localPath: '/projects/pilog',
        githubRepo: mockGitHubRepo,
        defaultBranch: 'main'
      })

      expect(repo.id).toBeDefined()
      expect(repo.name).toBe('pilog')
      expect(repo.owner).toBe('nick-neely')
      expect(repo.localPath).toBe('/projects/pilog')
      expect(repo.accessKind).toBe('host')
      expect(repo.githubUrl).toBe('https://github.com/nick-neely/pilog')
      expect(repo.defaultBranch).toBe('main')
      expect(repo.githubLabels).toEqual([
        { id: 1, name: 'bug', color: 'd73a4a', description: 'Something is broken' },
        { id: 2, name: 'ready-for-agent', color: '0e8a16', description: null }
      ])
      expect(repo.githubLabelsSyncedAt).toBeDefined()
      expect(clientMock.listLabels).toHaveBeenCalledWith('nick-neely', 'pilog')
    })

    it('creates a local Repo Index with lightweight signals when linking succeeds', async () => {
      const repoPath = await mkdtemp(path.join(os.tmpdir(), 'pilog-index-'))
      await mkdir(path.join(repoPath, 'src'))
      await mkdir(path.join(repoPath, 'components'))
      await mkdir(path.join(repoPath, 'node_modules'))
      await mkdir(path.join(repoPath, 'dist'))
      await writeFile(path.join(repoPath, 'pnpm-lock.yaml'), '')
      await writeFile(
        path.join(repoPath, 'package.json'),
        JSON.stringify({ dependencies: { react: '^19.0.0', vite: '^7.0.0' } })
      )
      clientMock.getOctokitClient.mockReturnValue({})
      clientMock.listLabels.mockResolvedValue([])

      const repo = await service.linkRepo(db, {
        localPath: repoPath,
        githubRepo: mockGitHubRepo,
        defaultBranch: 'main'
      })

      expect(repo.repoIndex).toMatchObject({
        status: 'ready',
        indexVersion: 1,
        packageManager: 'pnpm',
        frameworkSignals: ['React', 'Vite'],
        importantDirectories: [
          { path: 'components', role: 'Components' },
          { path: 'src', role: 'Source' }
        ],
        exclusionSummary: expect.objectContaining({
          dependency: 1,
          buildOutput: 1
        }),
        errorMessage: null
      })
      expect(repo.repoIndex?.lastIndexedAt).toBeDefined()
      expect(listDbRepos(db)[0].repoIndex?.status).toBe('ready')
    })

    it('keeps repo linking usable and stores a visible Repo Index failure', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      clientMock.listLabels.mockResolvedValue([])

      const repo = await service.linkRepo(db, {
        localPath: '/missing/projects/pilog',
        githubRepo: mockGitHubRepo,
        defaultBranch: 'main'
      })

      expect(repo.id).toBeDefined()
      expect(repo.repoIndex).toMatchObject({
        status: 'failed',
        indexVersion: 1,
        errorMessage: expect.stringContaining('ENOENT')
      })
      expect(listDbRepos(db)[0].repoIndex?.status).toBe('failed')
    })

    it('is the only path that writes to the repos table', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      clientMock.listLabels.mockResolvedValue([])

      await service.linkRepo(db, {
        localPath: '/projects/pilog',
        githubRepo: mockGitHubRepo,
        defaultBranch: 'main'
      })

      const rows = listDbRepos(db)
      expect(rows).toHaveLength(1)
    })

    it('persists WSL access metadata from the link request', async () => {
      clientMock.getOctokitClient.mockReturnValue({})
      clientMock.listLabels.mockResolvedValue([])

      const repo = await service.linkRepo(db, {
        localPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
        access: {
          kind: 'wsl',
          displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
          distro: 'Ubuntu',
          linuxPath: '/home/neely/dev/pilog'
        },
        githubRepo: mockGitHubRepo,
        defaultBranch: 'main'
      })

      expect(repo.localPath).toBe('\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog')
      expect(repo.accessKind).toBe('wsl')
      expect(repo.wslDistro).toBe('Ubuntu')
      expect(repo.wslPath).toBe('/home/neely/dev/pilog')
    })
  })
})
