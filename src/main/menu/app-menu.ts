import { Menu, type MenuItemConstructorOptions } from 'electron'

export function buildAppMenu(callbacks: {
  onNewNote: () => void
  onOpenSettings: () => void
}): Menu {
  const { onNewNote, onOpenSettings } = callbacks
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Note',
          accelerator: 'CmdOrCtrl+N',
          click: onNewNote
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: onOpenSettings
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({ role: 'appMenu' })
  }

  return Menu.buildFromTemplate(template)
}
