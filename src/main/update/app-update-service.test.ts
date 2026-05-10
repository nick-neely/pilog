import { EventEmitter } from 'events'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import type { UpdateCheckResult } from 'electron-updater'
import {
  AppUpdateService,
  readPackagedUpdateChannel,
  resolveAppUpdateChannel,
  type AppUpdateUpdater
} from './app-update-service'

class FakeUpdater extends EventEmitter implements AppUpdateUpdater {
  autoDownload = true
  autoInstallOnAppQuit = true
  allowPrerelease = false
  channel: string | null = null
  checkForUpdates = vi.fn<() => Promise<UpdateCheckResult | null>>(async () => null)
  downloadUpdate = vi.fn(async () => ['Pilog-1.1.0.dmg'])
  quitAndInstall = vi.fn()
}

describe('resolveAppUpdateChannel', () => {
  it('keeps stable builds on the stable update channel', () => {
    expect(resolveAppUpdateChannel({ version: '1.0.0' })).toBe('stable')
  })

  it('keeps preview builds on the preview update channel', () => {
    expect(resolveAppUpdateChannel({ version: '1.1.0-preview.2' })).toBe('preview')
  })

  it('lets build metadata explicitly select the V1 channel', () => {
    expect(resolveAppUpdateChannel({ version: '1.0.0', updateChannel: 'preview' })).toBe('preview')
  })
})

describe('readPackagedUpdateChannel', () => {
  it('reads the packaged electron-updater metadata channel', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilog-updates-'))
    writeFileSync(join(dir, 'app-update.yml'), 'provider: github\nchannel: preview\n')

    expect(readPackagedUpdateChannel(dir)).toBe('preview')
  })

  it('maps latest metadata to the stable app label', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilog-updates-'))
    writeFileSync(join(dir, 'app-update.yml'), 'provider: github\nchannel: latest\n')

    expect(readPackagedUpdateChannel(dir)).toBe('stable')
  })
})

describe('AppUpdateService', () => {
  it('does not initialize or check updates in development', async () => {
    const updater = new FakeUpdater()
    const service = new AppUpdateService(
      { isDev: true, isPackaged: false, version: '1.0.0' },
      updater
    )

    service.initialize()
    const status = await service.checkForUpdates()

    expect(status).toMatchObject({
      state: 'disabled',
      disabledReason: 'development',
      channel: 'stable'
    })
    expect(updater.channel).toBeNull()
    expect(updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('configures stable builds to use stable GitHub metadata only', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdateService(
      { isDev: false, isPackaged: true, version: '1.0.0' },
      updater
    )

    service.initialize()

    expect(updater.autoDownload).toBe(false)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    expect(updater.allowPrerelease).toBe(false)
    expect(updater.channel).toBe('latest')
    expect(service.getStatus()).toMatchObject({ channel: 'stable', channelLabel: 'Stable' })
  })

  it('configures preview builds to use preview GitHub metadata only', () => {
    const updater = new FakeUpdater()
    const service = new AppUpdateService(
      { isDev: false, isPackaged: true, version: '1.1.0-preview.1' },
      updater
    )

    service.initialize()

    expect(updater.allowPrerelease).toBe(true)
    expect(updater.channel).toBe('preview')
    expect(service.getStatus()).toMatchObject({ channel: 'preview', channelLabel: 'Preview' })
  })

  it('maps updater events into recoverable renderer status', async () => {
    const updater = new FakeUpdater()
    const broadcast = vi.fn()
    const service = new AppUpdateService(
      { isDev: false, isPackaged: true, version: '1.0.0' },
      updater,
      broadcast
    )
    service.initialize()

    updater.emit('checking-for-update')
    expect(service.getStatus()).toMatchObject({ state: 'checking', errorMessage: null })

    updater.emit('update-available', updateInfo('1.1.0'))
    expect(service.getStatus()).toMatchObject({ state: 'available', updateVersion: '1.1.0' })

    updater.emit('download-progress', { percent: 50 })
    expect(service.getStatus()).toMatchObject({ state: 'downloading' })

    updater.emit('update-downloaded', { ...updateInfo('1.1.0'), downloadedFile: '/tmp/app' })
    expect(service.getStatus()).toMatchObject({ state: 'downloaded', updateVersion: '1.1.0' })

    service.restartAndInstall()
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true)
    expect(broadcast).toHaveBeenCalled()
  })

  it('maps no-update check results without requiring a renderer-blocking error', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockResolvedValueOnce({
      isUpdateAvailable: false,
      updateInfo: updateInfo('1.0.0'),
      versionInfo: updateInfo('1.0.0')
    })
    const service = new AppUpdateService(
      { isDev: false, isPackaged: true, version: '1.0.0' },
      updater,
      vi.fn()
    )
    service.initialize()

    const status = await service.checkForUpdates()

    expect(status).toMatchObject({ state: 'not-available', updateVersion: '1.0.0' })
  })

  it('turns provider failures into a retryable error status', async () => {
    const updater = new FakeUpdater()
    updater.checkForUpdates.mockRejectedValueOnce(new Error('GitHub returned 503'))
    const service = new AppUpdateService(
      { isDev: false, isPackaged: true, version: '1.0.0' },
      updater,
      vi.fn()
    )
    service.initialize()

    const status = await service.checkForUpdates()

    expect(status).toMatchObject({ state: 'error', errorMessage: 'GitHub returned 503' })
  })
})

function updateInfo(version: string) {
  return {
    version,
    files: [],
    path: '',
    sha512: '',
    releaseDate: '2026-05-10T00:00:00.000Z'
  }
}
