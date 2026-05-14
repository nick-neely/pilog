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

  if (status.state === 'available') {
    const version = status.updateVersion ?? 'update'
    return {
      label: 'Update available',
      ariaLabel: `Update ${version} available. Open Software updates.`,
      tooltip: 'Open Software updates',
      tone: 'available'
    }
  }

  if (status.state === 'downloaded') {
    const version = status.updateVersion ?? 'the update'
    return {
      label: 'Restart ready',
      ariaLabel: `Update ${version} ready to install. Open Software updates.`,
      tooltip: 'Open Software updates',
      tone: 'restart'
    }
  }

  return null
}
