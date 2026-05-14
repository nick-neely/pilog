import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, contentTracing, ipcMain, Menu } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import trayIcon from '../../resources/tray-icon.png?asset'
import { loadDotEnvFile } from './config/env'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrations'
import {
  createElectronTraceDiagnostic,
  type ElectronTraceDiagnostic
} from './diagnostics/electron-trace'
import { cancelRunningAgentRuns } from './db/repositories/agent-runs'
import { getOnboardingState, getSetting, setSetting } from './db/repositories/settings'
import { registerGlobalHotkeys, unregisterGlobalHotkeys } from './hotkeys/register-global-hotkeys'
import { resolveGitHubAuthOptions } from './github/auth'
import { registerIpcHandlers } from './ipc/handlers'
import { registerGitHubIpcHandlers } from './ipc/github-handlers'
import { registerRepoIpcHandlers } from './ipc/repo-handlers'
import { registerPiIpcHandlers } from './ipc/pi-handlers'
import { log } from './lib/log'
import { buildAppMenu } from './menu/app-menu'
import { PILOG_APP_ID, PILOG_PRODUCT_NAME } from '../shared/app-identity'
import { shouldOpenMainWindowForOnboarding } from '../shared/onboarding'
import { createTray, destroyTray } from './tray/create-tray'
import {
  AppUpdateService,
  readPackagedUpdateChannel,
  registerAppUpdateIpcHandlers
} from './update/app-update-service'
import {
  destroyMainWindow,
  showMainWindow,
  showMainWindowOnRoute
} from './window/create-main-window'
import { hideScratchpad, openScratchpad } from './window/create-scratchpad-window'

loadDotEnvFile()

const BUNDLED_GITHUB_CLIENT_ID = process.env.PILOG_BUNDLED_GITHUB_CLIENT_ID?.trim() ?? ''

const isWslDevLaunch = is.dev && Boolean(process.env.WSL_DISTRO_NAME)
if (isWslDevLaunch && process.env.PILOG_ENABLE_WSL_GPU !== '1') {
  app.disableHardwareAcceleration()
}

if (process.env.PILOG_USER_DATA) {
  app.setPath('userData', process.env.PILOG_USER_DATA)
}

app.setName(PILOG_PRODUCT_NAME)

let electronTraceDiagnostic: ElectronTraceDiagnostic | null = null
let quittingAfterTraceStop = false

app.whenReady().then(async () => {
  electronTraceDiagnostic = createElectronTraceDiagnostic({
    env: process.env,
    argv: process.argv,
    defaultOutputDirectory: join(app.getPath('userData'), 'diagnostics', 'electron-traces'),
    contentTracing,
    log
  })
  await electronTraceDiagnostic.start()

  electronApp.setAppUserModelId(PILOG_APP_ID)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const dbPath = join(app.getPath('userData'), 'pilog.sqlite')
  const db = createDatabase(dbPath)
  runMigrations(db)
  cancelRunningAgentRuns(db, 'App restarted before generation finished.')

  // So the app opens to the inbox by default in development
  if (is.dev) {
    setSetting(db, 'openInboxAtLogin', 'true')
  }

  function broadcastNoteCreated(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('note:created')
    }
  }

  function broadcastIssueDraftsInvalidated(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('issue-drafts:invalidated')
    }
  }

  const appUpdateService = new AppUpdateService({
    isPackaged: app.isPackaged,
    isDev: is.dev,
    version: app.getVersion(),
    updateChannel:
      process.env.PILOG_UPDATE_CHANNEL ?? readPackagedUpdateChannel(process.resourcesPath)
  })
  appUpdateService.initialize()
  registerAppUpdateIpcHandlers(appUpdateService)
  appUpdateService.scheduleStartupCheck()

  registerIpcHandlers(db, {
    onNoteCreated: broadcastNoteCreated,
    onIssueDraftsChanged: broadcastIssueDraftsInvalidated,
    onGlobalHotkeyChanged: () => registerGlobalHotkeys(db, openScratchpad)
  })

  registerGitHubIpcHandlers(
    resolveGitHubAuthOptions({
      env: process.env,
      isDev: is.dev,
      bundledClientId: BUNDLED_GITHUB_CLIENT_ID
    }),
    db,
    {
      onIssueDraftsChanged: broadcastIssueDraftsInvalidated,
      onNoteChanged: broadcastNoteCreated
    }
  )

  registerRepoIpcHandlers(db)
  registerPiIpcHandlers(db, {
    iconPath: icon,
    onDraftsGenerated: () => {
      broadcastNoteCreated()
      broadcastIssueDraftsInvalidated()
    }
  })

  ipcMain.on('scratchpad:hide', () => {
    hideScratchpad()
  })

  ipcMain.on('tray:open-inbox', () => {
    showMainWindow(icon)
  })

  registerGlobalHotkeys(db, openScratchpad)

  const menu = buildAppMenu({
    onNewNote: openScratchpad,
    onOpenSettings: () => showMainWindowOnRoute(icon, 'navigate:settings')
  })
  Menu.setApplicationMenu(menu)

  createTray(trayIcon, {
    onOpenInbox: () => showMainWindow(icon),
    onNewNote: () => openScratchpad(),
    onOpenSettings: () => showMainWindowOnRoute(icon, 'navigate:settings')
  })

  const openAtLogin = getSetting(db, 'openInboxAtLogin') === 'true'
  const onboardingNeedsWindow = shouldOpenMainWindowForOnboarding(getOnboardingState(db))
  if (openAtLogin || onboardingNeedsWindow) {
    showMainWindow(icon)
  }

  app.on('activate', () => {
    showMainWindow(icon)
  })
})

app.on('before-quit', (event) => {
  destroyMainWindow()
  destroyTray()

  if (electronTraceDiagnostic?.enabled && !quittingAfterTraceStop) {
    event.preventDefault()
    quittingAfterTraceStop = true
    void electronTraceDiagnostic.stop('before-quit').finally(() => {
      app.quit()
    })
  }
})

app.on('will-quit', () => {
  unregisterGlobalHotkeys()
})

app.on('window-all-closed', () => {
  // Tray keeps the app alive — don't quit when windows close
})
