import { describe, expect, it } from 'vitest'
import { getPublishAuditEntryViewModel } from './publish-log-view'
import { DEFAULT_REPO_DRAFT_SETTINGS, type PublishAuditLogEntry } from '@shared/ipc'

const baseEntry: PublishAuditLogEntry = {
  id: 'log-1',
  draftId: null,
  draftTitle: null,
  repoId: 'repo-1',
  repo: {
    id: 'repo-1',
    name: 'pilog',
    owner: 'nick-neely',
    localPath: '/tmp/pilog',
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
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z'
  },
  githubIssueUrl: 'https://github.com/nick-neely/pilog/issues/34',
  publishedAt: '2026-05-09T20:00:00.000Z',
  sourceNotes: []
}

describe('getPublishAuditEntryViewModel', () => {
  it('describes hand-written publishes as local successful publishes without draft navigation', () => {
    expect(getPublishAuditEntryViewModel(baseEntry)).toMatchObject({
      repoLabel: 'nick-neely/pilog',
      title: 'Hand-written GitHub issue',
      sourceSummary: 'No local draft was linked to this publish.',
      canOpenDraft: false
    })
  })

  it('describes draft-backed review and auto-publish entries with draft navigation', () => {
    const entry: PublishAuditLogEntry = {
      ...baseEntry,
      draftId: 'draft-1',
      draftTitle: 'Fix save loading state',
      sourceNotes: [
        {
          id: 'note-1',
          content: 'save button needs loading state',
          status: 'published',
          repoId: 'repo-1',
          runId: 'run-1',
          captureContext: null,
          createdAt: '2026-05-09T19:00:00.000Z',
          updatedAt: '2026-05-09T20:00:00.000Z'
        }
      ]
    }

    expect(getPublishAuditEntryViewModel(entry)).toMatchObject({
      repoLabel: 'nick-neely/pilog',
      title: 'Fix save loading state',
      sourceSummary: '1 source note',
      canOpenDraft: true
    })
  })
})
