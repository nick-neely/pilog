import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPO_DRAFT_SETTINGS,
  applyRepoDraftSettingsOverride,
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

describe('applyRepoDraftSettingsOverride', () => {
  it('applies a partial run override without mutating the repo defaults', () => {
    const repo = {
      issueStyleDepth: 'balanced',
      issueStyleAudience: 'internal',
      draftContentToggles: DEFAULT_REPO_DRAFT_SETTINGS.draftContentToggles
    } as const

    const active = applyRepoDraftSettingsOverride(
      {
        id: 'repo-1',
        name: 'pilog',
        owner: 'nick',
        localPath: '/repo',
        accessKind: 'host',
        wslDistro: null,
        wslPath: null,
        githubUrl: null,
        defaultBranch: null,
        githubLabels: [],
        githubLabelsSyncedAt: null,
        autoPublishEnabled: false,
        autoPublishMaxIssuesPerRun: 5,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: false,
        autoPublishRequireConfirmation: true,
        allowDiffSummaryCapture: false,
        ...repo,
        repoIndex: null,
        createdAt: '2026-05-14T00:00:00.000Z',
        updatedAt: '2026-05-14T00:00:00.000Z'
      },
      {
        issueStyleDepth: 'detailed',
        draftContentToggles: {
          includeImplementationNotes: false,
          includeReproductionSteps: false
        }
      }
    )

    expect(active.issueStyleDepth).toBe('detailed')
    expect(active.issueStyleAudience).toBe('internal')
    expect(active.draftContentToggles.includeImplementationNotes).toBe(false)
    expect(active.draftContentToggles.includeReproductionSteps).toBe(false)
    expect(repo.issueStyleDepth).toBe('balanced')
    expect(repo.draftContentToggles.includeImplementationNotes).toBe(true)
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
