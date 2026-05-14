import { describe, expect, it } from 'vitest'
import { DIFF_SUMMARY_PRIVACY_COPY, repoPrivacySummary } from './repo-privacy-settings'

describe('repo privacy settings copy', () => {
  it('explains diff summary capture without implying raw diff storage', () => {
    expect(DIFF_SUMMARY_PRIVACY_COPY).toContain('new notes')
    expect(DIFF_SUMMARY_PRIVACY_COPY).toContain('changed file, insertion, and deletion counts')
    expect(DIFF_SUMMARY_PRIVACY_COPY).toContain('Raw diff contents are not stored')
  })

  it('summarizes the opt-in state', () => {
    expect(repoPrivacySummary({ allowDiffSummaryCapture: false })).toBe('Diff summaries off.')
    expect(repoPrivacySummary({ allowDiffSummaryCapture: true })).toBe('Diff summaries on.')
  })
})
