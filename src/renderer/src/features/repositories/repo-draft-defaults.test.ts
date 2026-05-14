import { describe, expect, it } from 'vitest'
import { DEFAULT_REPO_DRAFT_SETTINGS } from '@shared/ipc'
import { draftSettingsSummary } from './repo-draft-defaults'

describe('repo draft defaults status mapping', () => {
  it('summarizes default issue style and enabled content sections', () => {
    expect(draftSettingsSummary(DEFAULT_REPO_DRAFT_SETTINGS)).toBe(
      'balanced / internal, 6 of 6 sections on.'
    )
  })

  it('maps open source audience and disabled sections into the summary', () => {
    expect(
      draftSettingsSummary({
        issueStyleDepth: 'concise',
        issueStyleAudience: 'open_source',
        draftContentToggles: {
          includeImplementationNotes: false,
          includeAffectedFiles: true,
          includeSourceNotes: false,
          includeAcceptanceCriteria: true,
          includeConfidenceRationale: true,
          includeReproductionSteps: false
        }
      })
    ).toBe('concise / open source, 3 of 6 sections on.')
  })
})
