import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const openExternal = vi.fn()
const windows: FakeBrowserWindow[] = []

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true }
}))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function BrowserWindow(options: Record<string, unknown>) {
    const win = new FakeBrowserWindow(options)
    windows.push(win)
    return win
  }),
  shell: {
    openExternal
  }
}))

class FakeWebContents extends EventEmitter {
  send = vi.fn()
  setWindowOpenHandler = vi.fn()
}

class FakeBrowserWindow extends EventEmitter {
  readonly webContents = new FakeWebContents()
  readonly show = vi.fn()
  readonly focus = vi.fn()
  readonly hide = vi.fn()
  readonly close = vi.fn()
  readonly restore = vi.fn()
  readonly loadURL = vi.fn()
  readonly loadFile = vi.fn()
  destroyed = false
  minimized = false

  constructor(readonly options: Record<string, unknown>) {
    super()
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  isMinimized(): boolean {
    return this.minimized
  }
}

describe('main window', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    windows.length = 0
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
  })

  it('keeps the custom titlebar configuration for the main app window', async () => {
    const { showMainWindow } = await import('./create-main-window')

    showMainWindow('/tmp/icon.png')

    expect(windows[0]?.options).toMatchObject({
      show: false,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#f2eee5',
        symbolColor: '#38322b',
        height: 48
      }
    })
  })

  it('reveals the hidden window when the renderer finishes loading', async () => {
    const { showMainWindow } = await import('./create-main-window')

    showMainWindow('/tmp/icon.png')
    const win = windows[0]!

    expect(win.show).not.toHaveBeenCalled()

    win.webContents.emit('did-finish-load')

    expect(win.show).toHaveBeenCalledOnce()
    expect(win.focus).toHaveBeenCalledOnce()
  })

  it('restores the window before focusing it when opened from a minimized state', async () => {
    const { showMainWindow } = await import('./create-main-window')

    showMainWindow('/tmp/icon.png')
    const win = windows[0]!
    win.minimized = true

    win.emit('ready-to-show')

    expect(win.restore).toHaveBeenCalledOnce()
    expect(win.show).toHaveBeenCalledOnce()
    expect(win.focus).toHaveBeenCalledOnce()
  })

  it('sends a pending route after the fallback reveal path', async () => {
    const { showMainWindowOnRoute } = await import('./create-main-window')

    showMainWindowOnRoute('/tmp/icon.png', 'navigate:settings')
    const win = windows[0]!

    win.webContents.emit('did-finish-load')

    expect(win.webContents.send).toHaveBeenCalledWith('navigate:settings')
  })
})
