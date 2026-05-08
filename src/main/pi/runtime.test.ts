import { describe, expect, it } from 'vitest'
import { createIssueGenerationTools } from './runtime'
import type { IssueGenerationInput } from './issue-generation'

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
})

function baseInput(overrides: Partial<IssueGenerationInput> = {}): IssueGenerationInput {
  return {
    runId: 'run-1',
    repo: {
      id: 'repo-1',
      name: 'pilog',
      owner: 'nick-neely',
      localPath: process.cwd(),
      githubUrl: 'https://github.com/nick-neely/pilog',
      defaultBranch: 'main',
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
