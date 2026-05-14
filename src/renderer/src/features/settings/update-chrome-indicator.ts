import type { AppUpdateStatus } from '@shared/ipc'

export type UpdateChromeIndicator = {
  label: string
  ariaLabel: string
  tooltip: string
  tone: 'available' | 'restart'
}

export function getUpdateChromeIndicator(
  status: AppUpdateStatus | null
): UpdateChromeIndicator | null {
  if (!status) return null

  switch (status.state) {
    case 'available': {
      const version = status.updateVersion ?? 'update'
      return {
        label: 'Update available',
        ariaLabel: `Update ${version} available. Open Software updates.`,
        tooltip: 'Open Software updates',
        tone: 'available'
      }
    }
    case 'downloaded': {
      const version = status.updateVersion ?? 'the update'
      return {
        label: 'Restart ready',
        ariaLabel: `Update ${version} ready to install. Open Software updates.`,
        tooltip: 'Open Software updates',
        tone: 'restart'
      }
    }
    default:
      return null
  }
}
