import { Tray, Menu, app, nativeImage } from 'electron'
import { PILOG_PRODUCT_NAME } from '../../shared/app-identity'

let tray: Tray | null = null

export interface TrayCallbacks {
  onOpenInbox: () => void
  onNewNote: () => void
  onOpenSettings: () => void
}

export function createTray(iconPath: string, callbacks: TrayCallbacks): Tray {
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip(PILOG_PRODUCT_NAME)

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Inbox', click: callbacks.onOpenInbox },
    { label: 'New Note', click: callbacks.onNewNote },
    { label: 'Settings', click: callbacks.onOpenSettings },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])

  tray.setContextMenu(contextMenu)
  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
