import { describe, expect, it } from 'vitest'
import { DEFAULT_REPO_AUTO_PUBLISH_SETTINGS, type RepoAutoPublishSettings } from '@shared/ipc'
import { autoPublishSettingsSummary } from './repo-auto-publish-settings'

describe('repo auto-publish settings summary', () => {
  it('summarizes conservative default eligibility', () => {
    expect(autoPublishSettingsSummary(DEFAULT_REPO_AUTO_PUBLISH_SETTINGS)).toBe(
      'Auto-publish off, high confidence, known files required.'
    )
  })

  it('summarizes an explicit medium confidence policy', () => {
    const settings: RepoAutoPublishSettings = {
      ...DEFAULT_REPO_AUTO_PUBLISH_SETTINGS,
      autoPublishEnabled: true,
      autoPublishMinimumConfidence: 'medium',
      autoPublishRequireKnownAffectedFiles: false
    }

    expect(autoPublishSettingsSummary(settings)).toBe(
      'Auto-publish on, medium confidence, unknown files allowed.'
    )
  })
})
