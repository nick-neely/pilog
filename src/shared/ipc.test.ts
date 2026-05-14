import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPO_DRAFT_SETTINGS,
  normalizeRepoAutoPublishSettings,
  normalizeRepoDraftSettings
} from './ipc'

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

describe('normalizeRepoDraftSettings', () => {
  it('keeps valid issue style and draft content toggle defaults', () => {
    expect(
      normalizeRepoDraftSettings({
        issueStyleDepth: 'detailed',
        issueStyleAudience: 'open_source',
        draftContentToggles: {
          includeImplementationNotes: false,
          includeAffectedFiles: true,
          includeSourceNotes: false,
          includeAcceptanceCriteria: true,
          includeConfidenceRationale: false,
          includeReproductionSteps: true
        }
      })
    ).toEqual({
      issueStyleDepth: 'detailed',
      issueStyleAudience: 'open_source',
      draftContentToggles: {
        includeImplementationNotes: false,
        includeAffectedFiles: true,
        includeSourceNotes: false,
        includeAcceptanceCriteria: true,
        includeConfidenceRationale: false,
        includeReproductionSteps: true
      }
    })
  })

  it('falls back to balanced internal defaults for invalid values', () => {
    expect(
      normalizeRepoDraftSettings({
        issueStyleDepth: 'exhaustive',
        issueStyleAudience: 'public',
        draftContentToggles: {
          includeImplementationNotes: 'yes',
          includeAffectedFiles: false,
          includeSourceNotes: null,
          includeAcceptanceCriteria: true,
          includeConfidenceRationale: 1,
          includeReproductionSteps: false
        }
      })
    ).toEqual({
      issueStyleDepth: DEFAULT_REPO_DRAFT_SETTINGS.issueStyleDepth,
      issueStyleAudience: DEFAULT_REPO_DRAFT_SETTINGS.issueStyleAudience,
      draftContentToggles: {
        ...DEFAULT_REPO_DRAFT_SETTINGS.draftContentToggles,
        includeAffectedFiles: false,
        includeAcceptanceCriteria: true,
        includeReproductionSteps: false
      }
    })
  })
})
