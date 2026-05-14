import type { AppUpdateStatus } from '@shared/ipc'
import { describe, expect, it } from 'vitest'
import { getUpdateChromeIndicator } from './update-chrome-indicator'

describe('getUpdateChromeIndicator', () => {
  it('shows an app chrome affordance when an update is available', () => {
    expect(
      getUpdateChromeIndicator(status({ state: 'available', updateVersion: '1.1.0' }))
    ).toEqual({
      label: 'Update available',
      ariaLabel: 'Update 1.1.0 available. Open Software updates.',
      tooltip: 'Open Software updates',
      tone: 'available'
    })
  })

  it('shows a restart-ready affordance when an update is downloaded', () => {
    expect(
      getUpdateChromeIndicator(status({ state: 'downloaded', updateVersion: '1.1.0' }))
    ).toEqual({
      label: 'Restart ready',
      ariaLabel: 'Update 1.1.0 ready to install. Open Software updates.',
      tooltip: 'Open Software updates',
      tone: 'restart'
    })
  })

  it.each(['idle', 'checking', 'not-available', 'disabled', 'error', 'downloading'] as const)(
    'does not show app chrome for %s update state',
    (state) => {
      expect(getUpdateChromeIndicator(status({ state }))).toBeNull()
    }
  )
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
