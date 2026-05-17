import { describe, expect, it } from 'vitest'
import { createIssueGenerationTools, repoToToolAccessDescriptor } from './runtime'
import type { IssueGenerationInput } from './issue-generation'
import { DEFAULT_REPO_DRAFT_SETTINGS } from '@shared/ipc'

describe('Pi runtime tool registration', () => {
  it('registers web_search only when web search is enabled and configured', () => {
    const disabledTools = createIssueGenerationTools(baseInput(), () => []).map((tool) => tool.name)
    const enabledTools = createIssueGenerationTools(
      baseInput({ webSearch: { provider: 'brave', apiKey: 'brave-key' } }),
      () => []
    ).map((tool) => tool.name)

    expect(disabledTools).not.toContain('web_search')
    expect(disabledTools).not.toContain('web_fetch')
    expect(enabledTools).toContain('web_search')
    expect(enabledTools).not.toContain('web_fetch')
  })

  it('builds draft-generation repo tools from persisted WSL access metadata', () => {
    expect(
      repoToToolAccessDescriptor(
        baseInput({
          repo: {
            ...baseInput().repo,
            localPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pi log',
            accessKind: 'wsl',
            wslDistro: 'Ubuntu',
            wslPath: '/home/neely/dev/pi log'
          }
        }).repo
      )
    ).toEqual({
      kind: 'wsl',
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pi log',
      distro: 'Ubuntu',
      linuxPath: '/home/neely/dev/pi log'
    })
  })
})

function baseInput(overrides: Partial<IssueGenerationInput> = {}): IssueGenerationInput {
  return {
    runId: 'run-1',
    repo: {
      id: 'repo-1',
      name: 'pilog',
      owner: 'nick-neely',
      localPath: process.cwd(),
      accessKind: 'host',
      wslDistro: null,
      wslPath: null,
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main',
      githubLabels: [],
      githubLabelsSyncedAt: null,
      autoPublishEnabled: false,
      autoPublishMaxIssuesPerRun: 5,
      autoPublishDefaultLabel: 'triaged-by-pilog',
      autoPublishDryRun: false,
      autoPublishRequireConfirmation: true,
      autoPublishMinimumConfidence: 'high',
      autoPublishRequireKnownAffectedFiles: true,
      ...DEFAULT_REPO_DRAFT_SETTINGS,
      allowDiffSummaryCapture: false,
      createdAt: '2026-05-08T00:00:00.000Z',
      updatedAt: '2026-05-08T00:00:00.000Z'
    },
    notes: [],
    provider: 'pilog-fixture',
    model: 'tracer',
    turnBudget: 20,
    ...overrides
  }
}
