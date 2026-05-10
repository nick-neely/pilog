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

  if (status.state === 'disabled') {
    return {
      title: `Updates disabled in ${disabledLabel(status.disabledReason)}`,
      detail: `Version ${status.version} (${status.channelLabel}). Packaged builds check GitHub Releases.`,
      canCheck: false,
      canDownload: false,
      canRestart: false,
      busy: false
    }
  }

  if (status.state === 'checking') {
    return {
      title: 'Checking for updates',
      detail: `Version ${status.version} (${status.channelLabel}).`,
      canCheck: false,
      canDownload: false,
      canRestart: false,
      busy: true
    }
  }

  if (status.state === 'available') {
    return {
      title: `Version ${status.updateVersion ?? 'update'} is available`,
      detail: 'Download it now, then restart when Pilog is ready.',
      canCheck: true,
      canDownload: true,
      canRestart: false,
      busy: false
    }
  }

  if (status.state === 'downloading') {
    return {
      title: 'Downloading update',
      detail: `Version ${status.updateVersion ?? 'the update'} is being saved in the background.`,
      canCheck: false,
      canDownload: false,
      canRestart: false,
      busy: true
    }
  }

  if (status.state === 'downloaded') {
    return {
      title: `Version ${status.updateVersion ?? 'the update'} is ready`,
      detail: 'Restart Pilog when you are not capturing a note.',
      canCheck: true,
      canDownload: false,
      canRestart: true,
      busy: false
    }
  }

  if (status.state === 'error') {
    return {
      title: 'Update check failed',
      detail: status.errorMessage ?? 'Check your connection and try again.',
      canCheck: true,
      canDownload: false,
      canRestart: false,
      busy: false
    }
  }

  if (status.state === 'not-available') {
    return {
      title: 'Pilog is up to date',
      detail: lastCheckedDetail(status),
      canCheck: true,
      canDownload: false,
      canRestart: false,
      busy: false
    }
  }

  return {
    title: 'Updates',
    detail: `Version ${status.version} (${status.channelLabel}).`,
    canCheck: true,
    canDownload: false,
    canRestart: false,
    busy: false
  }
}

function disabledLabel(reason: AppUpdateStatus['disabledReason']): string {
  if (reason === 'development') return 'development'
  return 'this unpackaged build'
}

function lastCheckedDetail(status: AppUpdateStatus): string {
  if (!status.lastCheckedAt) return `Version ${status.version} (${status.channelLabel}).`
  return `Last checked ${new Date(status.lastCheckedAt).toLocaleString()}.`
}
