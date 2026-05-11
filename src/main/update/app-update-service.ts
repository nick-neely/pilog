import { readFileSync } from 'fs'
import { join } from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdateCheckResult } from 'electron-updater'
import type { AppUpdateChannel, AppUpdateStatus } from '@shared/ipc'

type UpdaterEvent =
  | 'checking-for-update'
  | 'update-not-available'
  | 'update-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

export type AppUpdateUpdater = {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  channel: string | null
  on: (event: UpdaterEvent, listener: (...args: unknown[]) => void) => AppUpdateUpdater
  checkForUpdates: () => Promise<UpdateCheckResult | null>
  downloadUpdate: () => Promise<string[]>
  quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void
}

export type AppUpdateEnvironment = {
  isPackaged: boolean
  isDev: boolean
  version: string
  updateChannel?: string | null
}

export function resolveAppUpdateChannel(input: {
  version: string
  updateChannel?: string | null
}): AppUpdateChannel {
  const normalizedChannel = normalizeAppUpdateChannel(input.updateChannel)
  if (normalizedChannel) return normalizedChannel
  return input.version.includes('-') ? 'preview' : 'stable'
}

export function readPackagedUpdateChannel(resourcesPath: string): AppUpdateChannel | null {
  try {
    const contents = readFileSync(join(resourcesPath, 'app-update.yml'), 'utf8')
    const channel = contents.match(/^\s*channel:\s*['"]?([A-Za-z0-9_-]+)/m)?.[1] ?? null
    return normalizeAppUpdateChannel(channel)
  } catch {
    return null
  }
}

function normalizeAppUpdateChannel(channel: string | null | undefined): AppUpdateChannel | null {
  if (channel === 'preview') return 'preview'
  if (channel === 'stable' || channel === 'latest') return 'stable'
  return null
}

function channelLabel(channel: AppUpdateChannel): string {
  return channel === 'preview' ? 'Preview' : 'Stable'
}

function updaterChannel(channel: AppUpdateChannel): string {
  return channel === 'preview' ? 'preview' : 'latest'
}

function disabledReason(
  env: Pick<AppUpdateEnvironment, 'isDev' | 'isPackaged'>
): AppUpdateStatus['disabledReason'] {
  if (env.isDev) return 'development'
  if (!env.isPackaged) return 'unpackaged'
  return null
}

export class AppUpdateService {
  private status: AppUpdateStatus
  private initialized = false
  private readonly updater: AppUpdateUpdater | null

  constructor(
    env: AppUpdateEnvironment,
    updater?: AppUpdateUpdater,
    private readonly broadcast: (status: AppUpdateStatus) => void = broadcastAppUpdateStatus
  ) {
    const channel = resolveAppUpdateChannel(env)
    const reason = disabledReason(env)
    this.updater = reason ? null : (updater ?? autoUpdater)
    this.status = {
      state: reason ? 'disabled' : 'idle',
      version: env.version,
      channel,
      channelLabel: channelLabel(channel),
      updateVersion: null,
      lastCheckedAt: null,
      errorMessage: null,
      disabledReason: reason
    }
  }

  initialize(): void {
    if (this.initialized || this.status.state === 'disabled') return
    if (!this.updater) return
    this.initialized = true

    this.updater.autoDownload = false
    this.updater.autoInstallOnAppQuit = false
    this.updater.channel = updaterChannel(this.status.channel)
    this.updater.allowPrerelease = this.status.channel === 'preview'

    this.updater.on('checking-for-update', () => {
      this.setStatus({ state: 'checking', errorMessage: null })
    })
    this.updater.on('update-not-available', (info) => {
      this.setCheckedStatus('not-available', info)
    })
    this.updater.on('update-available', (info) => {
      this.setCheckedStatus('available', info)
    })
    this.updater.on('download-progress', () => {
      this.setStatus({ state: 'downloading', errorMessage: null })
    })
    this.updater.on('update-downloaded', (event) => {
      this.setStatus({
        state: 'downloaded',
        updateVersion: getUpdateVersion(event),
        errorMessage: null
      })
    })
    this.updater.on('error', (error) => {
      this.setErrorStatus(error, { lastCheckedAt: new Date().toISOString() })
    })
  }

  getStatus(): AppUpdateStatus {
    return this.status
  }

  async checkForUpdates(): Promise<AppUpdateStatus> {
    if (this.status.state === 'disabled') return this.status
    if (!this.updater) return this.status
    try {
      const result = await this.updater.checkForUpdates()
      this.setStatusFromCheckResult(result)
    } catch (error) {
      this.setErrorStatus(error, { lastCheckedAt: new Date().toISOString() })
    }
    return this.status
  }

  async downloadUpdate(): Promise<AppUpdateStatus> {
    if (this.status.state !== 'available') return this.status
    if (!this.updater) return this.status
    this.setStatus({ state: 'downloading', errorMessage: null })
    try {
      await this.updater.downloadUpdate()
    } catch (error) {
      this.setErrorStatus(error)
    }
    return this.status
  }

  restartAndInstall(): AppUpdateStatus {
    if (this.status.state !== 'downloaded') return this.status
    if (!this.updater) return this.status
    this.updater.quitAndInstall(false, true)
    return this.status
  }

  private setStatus(patch: Partial<AppUpdateStatus>): void {
    this.status = { ...this.status, ...patch }
    this.broadcast(this.status)
  }

  private setStatusFromCheckResult(result: UpdateCheckResult | null): void {
    if (result?.isUpdateAvailable === false) {
      this.setCheckedStatus('not-available', result.updateInfo)
      return
    }

    if (result?.isUpdateAvailable === true) {
      this.setCheckedStatus('available', result.updateInfo)
    }
  }

  private setCheckedStatus(
    state: Extract<AppUpdateStatus['state'], 'not-available' | 'available'>,
    info: unknown
  ): void {
    this.setStatus({
      state,
      updateVersion: getUpdateVersion(info),
      lastCheckedAt: new Date().toISOString(),
      errorMessage: null
    })
  }

  private setErrorStatus(error: unknown, patch: { lastCheckedAt?: string } = {}): void {
    this.setStatus({
      state: 'error',
      errorMessage: getErrorMessage(error),
      ...patch
    })
  }
}

export function registerAppUpdateIpcHandlers(service: AppUpdateService): void {
  ipcMain.handle('app-updates:getStatus', () => service.getStatus())
  ipcMain.handle('app-updates:check', () => service.checkForUpdates())
  ipcMain.handle('app-updates:download', () => service.downloadUpdate())
  ipcMain.handle('app-updates:restart', () => service.restartAndInstall())
}

export function broadcastAppUpdateStatus(status: AppUpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('app-updates:status', status)
  }
}

function getUpdateVersion(info: unknown): string | null {
  if (typeof info === 'object' && info !== null && 'version' in info) {
    const version = info.version
    return typeof version === 'string' ? version : null
  }
  return null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return 'Update check failed. Try again when your connection is available.'
}
