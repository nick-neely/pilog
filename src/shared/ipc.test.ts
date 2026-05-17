import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPO_DRAFT_SETTINGS,
  applyRepoDraftSettingsForGenerationMode,
  applyRepoDraftSettingsOverride,
  normalizeRepoAutoPublishSettings,
  normalizeRepoDraftSettings,
  type Repo
} from './ipc'

describe('normalizeRepoAutoPublishSettings', () => {
  it('normalizes issue limit and default label without changing toggles', () => {
    expect(
      normalizeRepoAutoPublishSettings({
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 2.8,
        autoPublishDefaultLabel: ' needs-triage ',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: false,
        autoPublishMinimumConfidence: 'medium',
        autoPublishRequireKnownAffectedFiles: false
      })
    ).toEqual({
      autoPublishEnabled: true,
      autoPublishMaxIssuesPerRun: 2,
      autoPublishDefaultLabel: 'needs-triage',
      autoPublishDryRun: true,
      autoPublishRequireConfirmation: false,
      autoPublishMinimumConfidence: 'medium',
      autoPublishRequireKnownAffectedFiles: false
    })
  })

  it('falls back when issue limit and default label are blank', () => {
    expect(
      normalizeRepoAutoPublishSettings({
        autoPublishEnabled: false,
        autoPublishMaxIssuesPerRun: Number.NaN,
        autoPublishDefaultLabel: '   ',
        autoPublishDryRun: false,
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'low',
        autoPublishRequireKnownAffectedFiles: 'yes'
      })
    ).toMatchObject({
      autoPublishMaxIssuesPerRun: 1,
      autoPublishDefaultLabel: 'triaged-by-pilog',
      autoPublishMinimumConfidence: 'high',
      autoPublishRequireKnownAffectedFiles: true
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
        autoPublishMinimumConfidence: 'high',
        autoPublishRequireKnownAffectedFiles: true,
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

describe('applyRepoDraftSettingsForGenerationMode', () => {
  const repo: Repo = {
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
    autoPublishMinimumConfidence: 'high',
    autoPublishRequireKnownAffectedFiles: true,
    allowDiffSummaryCapture: false,
    issueStyleDepth: 'balanced',
    issueStyleAudience: 'internal',
    draftContentToggles: DEFAULT_REPO_DRAFT_SETTINGS.draftContentToggles,
    repoIndex: null,
    createdAt: '2026-05-14T00:00:00.000Z',
    updatedAt: '2026-05-14T00:00:00.000Z'
  }

  const override = {
    issueStyleDepth: 'detailed',
    issueStyleAudience: 'open_source',
    draftContentToggles: {
      includeImplementationNotes: false,
      includeSourceNotes: false
    }
  } as const

  it('uses temporary draft overrides for review generation', () => {
    const active = applyRepoDraftSettingsForGenerationMode(repo, 'review', override)

    expect(active.issueStyleDepth).toBe('detailed')
    expect(active.issueStyleAudience).toBe('open_source')
    expect(active.draftContentToggles.includeImplementationNotes).toBe(false)
    expect(active.draftContentToggles.includeSourceNotes).toBe(false)
  })

  it('uses saved repo draft defaults for auto-publish generation', () => {
    const active = applyRepoDraftSettingsForGenerationMode(
      repo,
      'auto-publish-preview',
      override
    )

    expect(active.issueStyleDepth).toBe('balanced')
    expect(active.issueStyleAudience).toBe('internal')
    expect(active.draftContentToggles.includeImplementationNotes).toBe(true)
    expect(active.draftContentToggles.includeSourceNotes).toBe(true)
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
