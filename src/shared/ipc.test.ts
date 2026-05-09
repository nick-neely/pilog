import { describe, expect, it } from 'vitest'
import { normalizeRepoAutoPublishSettings } from './ipc'

describe('normalizeRepoAutoPublishSettings', () => {
  it('normalizes issue limit and default label without changing toggles', () => {
    expect(
      normalizeRepoAutoPublishSettings({
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 2.8,
        autoPublishDefaultLabel: ' needs-triage ',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: false
      })
    ).toEqual({
      autoPublishEnabled: true,
      autoPublishMaxIssuesPerRun: 2,
      autoPublishDefaultLabel: 'needs-triage',
      autoPublishDryRun: true,
      autoPublishRequireConfirmation: false
    })
  })

  it('falls back when issue limit and default label are blank', () => {
    expect(
      normalizeRepoAutoPublishSettings({
        autoPublishEnabled: false,
        autoPublishMaxIssuesPerRun: Number.NaN,
        autoPublishDefaultLabel: '   ',
        autoPublishDryRun: false,
        autoPublishRequireConfirmation: true
      })
    ).toMatchObject({
      autoPublishMaxIssuesPerRun: 1,
      autoPublishDefaultLabel: 'triaged-by-pilog'
    })
  })
})
