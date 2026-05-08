import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrations'
import { getSetting, setSetting } from './db/repositories/settings'
import { registerGlobalHotkeys, unregisterGlobalHotkeys } from './hotkeys/register-global-hotkeys'
import { registerIpcHandlers } from './ipc/handlers'
import { registerGitHubIpcHandlers } from './ipc/github-handlers'
import { buildAppMenu } from './menu/app-menu'
import { createTray, destroyTray } from './tray/create-tray'
import {
  destroyMainWindow,
  showMainWindow,
  showMainWindowOnRoute
} from './window/create-main-window'
import { hideScratchpad, openScratchpad } from './window/create-scratchpad-window'

if (process.env.PILOG_USER_DATA) {
  app.setPath('userData', process.env.PILOG_USER_DATA)
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const dbPath = join(app.getPath('userData'), 'pilog.sqlite')
  const db = createDatabase(dbPath)
  runMigrations(db)

  // So the app opens to the inbox by default in development
  if (is.dev) {
    setSetting(db, 'openInboxAtLogin', 'true')
  }

  function broadcastNoteCreated(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('note:created')
    }
  }

  registerIpcHandlers(db, { onNoteCreated: broadcastNoteCreated })

  registerGitHubIpcHandlers({
    clientId: process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? ''
  })

  ipcMain.on('scratchpad:hide', () => {
    hideScratchpad()
  })

  ipcMain.on('tray:open-inbox', () => {
    showMainWindow(icon)
  })

  registerGlobalHotkeys(db, openScratchpad)

  const menu = buildAppMenu(openScratchpad)
  Menu.setApplicationMenu(menu)

  createTray(icon, {
    onOpenInbox: () => showMainWindow(icon),
    onNewNote: () => openScratchpad(),
    onOpenSettings: () => showMainWindowOnRoute(icon, 'navigate:settings')
  })

  const openAtLogin = getSetting(db, 'openInboxAtLogin') === 'true'
  if (openAtLogin) {
    showMainWindow(icon)
  }

  app.on('activate', () => {
    showMainWindow(icon)
  })
})

app.on('before-quit', () => {
  destroyMainWindow()
  destroyTray()
})

app.on('will-quit', () => {
  unregisterGlobalHotkeys()
})

app.on('window-all-closed', () => {
  // Tray keeps the app alive — don't quit when windows close
})
