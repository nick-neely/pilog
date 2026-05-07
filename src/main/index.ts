import { app, shell, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrations'
import { registerIpcHandlers } from './ipc/handlers'
import { openScratchpad, hideScratchpad } from './window/create-scratchpad-window'
import { buildAppMenu } from './menu/app-menu'
import { registerGlobalHotkeys, unregisterGlobalHotkeys } from './hotkeys/register-global-hotkeys'

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

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

  function broadcastNoteCreated(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('note:created')
    }
  }

  registerIpcHandlers(db, { onNoteCreated: broadcastNoteCreated })

  ipcMain.on('scratchpad:hide', () => {
    hideScratchpad()
  })

  registerGlobalHotkeys(db, openScratchpad)

  const menu = buildAppMenu(openScratchpad)
  Menu.setApplicationMenu(menu)

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  unregisterGlobalHotkeys()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
