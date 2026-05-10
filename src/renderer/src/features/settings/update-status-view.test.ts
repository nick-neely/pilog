import { describe, expect, it } from 'vitest'
import type { AppUpdateStatus } from '@shared/ipc'
import { getUpdateStatusView } from './update-status-view'

describe('getUpdateStatusView', () => {
  it('keeps development builds visibly disabled', () => {
    expect(
      getUpdateStatusView(status({ state: 'disabled', disabledReason: 'development' }))
    ).toEqual(
      expect.objectContaining({
        title: 'Updates disabled in development',
        canCheck: false,
        canDownload: false,
        canRestart: false
      })
    )
  })

  it('offers download only when an update is available', () => {
    expect(getUpdateStatusView(status({ state: 'available', updateVersion: '1.1.0' }))).toEqual(
      expect.objectContaining({
        title: 'Version 1.1.0 is available',
        canCheck: true,
        canDownload: true,
        canRestart: false
      })
    )
  })

  it('offers restart only after the update is downloaded', () => {
    expect(getUpdateStatusView(status({ state: 'downloaded', updateVersion: '1.1.0' }))).toEqual(
      expect.objectContaining({
        title: 'Version 1.1.0 is ready',
        canCheck: true,
        canDownload: false,
        canRestart: true
      })
    )
  })

  it('turns errors into a retry action', () => {
    expect(
      getUpdateStatusView(status({ state: 'error', errorMessage: 'GitHub returned 503' }))
    ).toEqual(
      expect.objectContaining({
        title: 'Update check failed',
        detail: 'GitHub returned 503',
        canCheck: true,
        canDownload: false,
        canRestart: false
      })
    )
  })
})

function status(patch: Partial<AppUpdateStatus>): AppUpdateStatus {
  return {
    state: 'idle',
    version: '1.0.0',
    channel: 'stable',
    channelLabel: 'Stable',
    updateVersion: null,
    lastCheckedAt: null,
    errorMessage: null,
    disabledReason: null,
    ...patch
  }
}
