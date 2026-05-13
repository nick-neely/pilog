import { BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import type { IpcEvent } from '@shared/ipc'

let mainWindow: BrowserWindow | null = null
let windowReady = false
let pendingRoute: IpcEvent | null = null

function revealMainWindow(): void {
  const win = mainWindow
  if (!win || win.isDestroyed()) return

  windowReady = true
  if (win.isMinimized()) {
    win.restore()
  }
  win.show()
  win.focus()
  if (pendingRoute) {
    win.webContents.send(pendingRoute)
    pendingRoute = null
  }
}

function getOrCreateWindow(icon: string): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  windowReady = false
  pendingRoute = null

  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    backgroundColor: '#f2eee5',
    autoHideMenuBar: process.platform !== 'darwin',
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin'
      ? {
          titleBarOverlay: {
            color: '#f2eee5',
            symbolColor: '#38322b',
            height: 48
          }
        }
      : {}),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    revealMainWindow()
  })

  // In some GPU/window-manager combinations, a hidden Electron window can finish loading
  // without ever reaching ready-to-show. Do not leave the app stranded in the taskbar.
  mainWindow.webContents.once('did-finish-load', () => {
    revealMainWindow()
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    windowReady = false
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

export function showMainWindow(icon: string): void {
  const win = getOrCreateWindow(icon)
  if (windowReady) {
    win.show()
    win.focus()
  }
}

export function showMainWindowOnRoute(icon: string, route: IpcEvent): void {
  const win = getOrCreateWindow(icon)
  if (windowReady) {
    win.show()
    win.focus()
    win.webContents.send(route)
  } else {
    pendingRoute = route
  }
}

export function destroyMainWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners('close')
    mainWindow.close()
  }
  mainWindow = null
  windowReady = false
}
