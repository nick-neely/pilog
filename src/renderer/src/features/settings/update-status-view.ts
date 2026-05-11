import type { AppUpdateStatus } from '@shared/ipc'

export type UpdateStatusView = {
  title: string
  detail: string
  canCheck: boolean
  canDownload: boolean
  canRestart: boolean
  busy: boolean
}

export function getUpdateStatusView(status: AppUpdateStatus | null): UpdateStatusView {
  if (!status) {
    return {
      title: 'Loading update status',
      detail: 'Pilog is reading the installed version.',
      canCheck: false,
      canDownload: false,
      canRestart: false,
      busy: true
    }
  }

  switch (status.state) {
    case 'disabled':
      return {
        title: `Updates disabled in ${disabledLabel(status.disabledReason)}`,
        detail: `Version ${status.version} (${status.channelLabel}). Packaged builds check GitHub Releases.`,
        canCheck: false,
        canDownload: false,
        canRestart: false,
        busy: false
      }
    case 'checking':
      return {
        title: 'Checking for updates',
        detail: versionDetail(status),
        canCheck: false,
        canDownload: false,
        canRestart: false,
        busy: true
      }
    case 'available':
      return {
        title: `Version ${status.updateVersion ?? 'update'} is available`,
        detail: 'Download it now, then restart when Pilog is ready.',
        canCheck: true,
        canDownload: true,
        canRestart: false,
        busy: false
      }
    case 'downloading':
      return {
        title: 'Downloading update',
        detail: `Version ${status.updateVersion ?? 'the update'} is being saved in the background.`,
        canCheck: false,
        canDownload: false,
        canRestart: false,
        busy: true
      }
    case 'downloaded':
      return {
        title: `Version ${status.updateVersion ?? 'the update'} is ready`,
        detail: 'Restart Pilog when you are not capturing a note.',
        canCheck: true,
        canDownload: false,
        canRestart: true,
        busy: false
      }
    case 'error':
      return {
        title: 'Update check failed',
        detail: status.errorMessage ?? 'Check your connection and try again.',
        canCheck: true,
        canDownload: false,
        canRestart: false,
        busy: false
      }
    case 'not-available':
      return {
        title: 'Pilog is up to date',
        detail: lastCheckedDetail(status),
        canCheck: true,
        canDownload: false,
        canRestart: false,
        busy: false
      }
    case 'idle':
      return {
        title: 'Ready to check for updates',
        detail: versionDetail(status),
        canCheck: true,
        canDownload: false,
        canRestart: false,
        busy: false
      }
  }
}

function disabledLabel(reason: AppUpdateStatus['disabledReason']): string {
  if (reason === 'development') return 'development'
  return 'this unpackaged build'
}

function lastCheckedDetail(status: AppUpdateStatus): string {
  if (!status.lastCheckedAt) return versionDetail(status)
  return `Last checked ${new Date(status.lastCheckedAt).toLocaleString()}.`
}

function versionDetail(status: Pick<AppUpdateStatus, 'version' | 'channelLabel'>): string {
  return `Version ${status.version} (${status.channelLabel}).`
}
