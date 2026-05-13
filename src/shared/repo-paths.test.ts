import { describe, expect, it } from 'vitest'
import { formatRepoLocation, repoAccessFromRepo, resolveWslLinuxPath } from './repo-paths'
import type { Repo } from './ipc'

describe('repo path helpers', () => {
  it('keeps WSL repository locations user-facing and distro-specific', () => {
    const repo = makeRepo({
      localPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
      accessKind: 'wsl',
      wslDistro: 'Ubuntu',
      wslPath: '/home/neely/dev/pilog'
    })

    expect(repoAccessFromRepo(repo)).toEqual({
      kind: 'wsl',
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
      distro: 'Ubuntu',
      linuxPath: '/home/neely/dev/pilog'
    })
    expect(formatRepoLocation(repo)).toEqual({
      label: 'WSL Ubuntu: /home/neely/dev/pilog',
      tooltipText:
        'WSL Ubuntu: /home/neely/dev/pilog\n\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
      context: 'Paths are relative to WSL Ubuntu: /home/neely/dev/pilog.'
    })
  })

  it('leaves host-local repository locations unchanged', () => {
    const repo = makeRepo({ localPath: '/repo' })

    expect(repoAccessFromRepo(repo)).toEqual({ kind: 'host', displayPath: '/repo' })
    expect(formatRepoLocation(repo)).toEqual({
      label: '/repo',
      tooltipText: '/repo',
      context: null
    })
  })

  it('resolves relative affected files against the WSL Linux root for copy fallback', () => {
    expect(
      resolveWslLinuxPath(
        {
          kind: 'wsl',
          displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
          distro: 'Ubuntu',
          linuxPath: '/home/neely/dev/pilog'
        },
        'src/save.ts'
      )
    ).toBe('/home/neely/dev/pilog/src/save.ts')
  })
})

function makeRepo(overrides: Partial<Repo>): Repo {
  return {
    id: 'repo-1',
    name: 'pilog',
    owner: 'nick-neely',
    localPath: '/repo',
    accessKind: 'host',
    wslDistro: null,
    wslPath: null,
    githubUrl: 'https://github.com/nick-neely/pilog',
    defaultBranch: 'main',
    githubLabels: [],
    githubLabelsSyncedAt: null,
    autoPublishEnabled: false,
    autoPublishMaxIssuesPerRun: 3,
    autoPublishDefaultLabel: 'triage',
    autoPublishDryRun: true,
    autoPublishRequireConfirmation: true,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    ...overrides
  }
}
