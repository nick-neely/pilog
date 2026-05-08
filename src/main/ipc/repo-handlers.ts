import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { PilogDatabase } from '../db/client'
import type { LinkRepoRequest } from '@shared/ipc'
import { listRepos, deleteRepo } from '../db/repositories/repos'
import { detectLocalRepo, linkRepo } from '../repos/local-repo-service'

export function registerRepoIpcHandlers(db: PilogDatabase): void {
  ipcMain.handle('repos:list', () => {
    return listRepos(db)
  })

  ipcMain.handle('repos:detectLocal', (_event, request: { localPath: string }) => {
    return detectLocalRepo(request.localPath)
  })

  ipcMain.handle('repos:link', (_event, request: LinkRepoRequest) => {
    return linkRepo(db, request)
  })

  ipcMain.handle('repos:unlink', (_event, request: { id: string }) => {
    return deleteRepo(db, request.id)
  })

  ipcMain.handle('dialog:openDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openDirectory' as const] }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
