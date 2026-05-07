import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

const WIDTH = 480
const HEIGHT = 360

let scratchpadWindow: BrowserWindow | null = null

export function openScratchpad(): void {
  if (scratchpadWindow && !scratchpadWindow.isDestroyed()) {
    scratchpadWindow.webContents.send('scratchpad:reset')
    scratchpadWindow.show()
    scratchpadWindow.focus()
    return
  }

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { x, y, width, height } = display.workArea

  scratchpadWindow = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    x: Math.round(x + (width - WIDTH) / 2),
    y: Math.round(y + (height - HEIGHT) / 2),
    frame: false,
    alwaysOnTop: true,
    show: false,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  scratchpadWindow.on('ready-to-show', () => {
    scratchpadWindow?.show()
    scratchpadWindow?.focus()
  })

  scratchpadWindow.on('closed', () => {
    scratchpadWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    scratchpadWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/scratchpad.html`)
  } else {
    scratchpadWindow.loadFile(join(__dirname, '../renderer/scratchpad.html'))
  }
}

export function hideScratchpad(): void {
  if (scratchpadWindow && !scratchpadWindow.isDestroyed()) {
    scratchpadWindow.hide()
  }
}
