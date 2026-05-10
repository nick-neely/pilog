import { describe, expect, it } from 'vitest'
import {
  getGenerationRecoveryState,
  getPiSetupRecoveryState,
  getPublishRecoveryState
} from './recovery-state'

describe('recovery state copy', () => {
  it('gives Pi setup failures a plain retry path', () => {
    expect(
      getPiSetupRecoveryState({
        error: 'Could not read provider list.',
        hasProviders: false
      })
    ).toEqual({
      title: 'Pi configuration unavailable',
      description:
        'Pilog could not read the provider and model list. Check your Pi setup, then try loading it again.',
      actionLabel: 'Try again',
      intent: 'retry'
    })
  })

  it('points generation credential failures back to Settings', () => {
    expect(
      getGenerationRecoveryState({
        message: 'Pi auth is invalid.',
        cause: 'auth_invalid'
      })
    ).toEqual({
      title: 'Draft generation needs Pi credentials',
      description:
        'No drafts were created. Add the provider key in Settings, then run generation again.',
      actionLabel: 'Open Settings',
      intent: 'settings'
    })
  })

  it('keeps publish failures recoverable from the draft', () => {
    expect(getPublishRecoveryState('GitHub validation failed: 422').description).toBe(
      'GitHub rejected this issue as invalid. Review the title, body, and labels, then try Publish again.'
    )
  })
})
