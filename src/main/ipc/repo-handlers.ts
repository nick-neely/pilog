import { ipcMain, dialog, BrowserWindow } from 'electron'
import type { PilogDatabase } from '../db/client'
import type { LinkRepoRequest, UpdateRepoAutoPublishSettingsRequest } from '@shared/ipc'
import {
  listRepos,
  deleteRepo,
  getRepoById,
  updateRepoAutoPublishSettings
} from '../db/repositories/repos'
import { detectLocalRepo, linkRepo, refreshRepoIndex } from '../repos/local-repo-service'
import { resolveDefaultIssueTemplate } from '../github/issue-templates'
import { getRuntimeReadiness } from '../runtime-readiness'

export function registerRepoIpcHandlers(db: PilogDatabase): void {
  ipcMain.handle('repos:list', () => {
    return listRepos(db)
  })

  ipcMain.handle('runtime:readiness', () => {
    return getRuntimeReadiness({}, listRepos(db))
  })

  ipcMain.handle('repos:detectLocal', (_event, request: { localPath: string }) => {
    return detectLocalRepo(request.localPath)
  })

  ipcMain.handle('repos:link', async (_event, request: LinkRepoRequest) => {
    return linkRepo(db, request)
  })

  ipcMain.handle('repos:refreshIndex', async (_event, request: { id: string }) => {
    return refreshRepoIndex(db, request.id)
  })

  ipcMain.handle(
    'repos:updateAutoPublishSettings',
    (_event, request: UpdateRepoAutoPublishSettingsRequest) => {
      return updateRepoAutoPublishSettings(db, request.id, request)
    }
  )

  ipcMain.handle('repos:getDefaultIssueTemplate', (_event, request: { id: string }) => {
    const repo = getRepoById(db, request.id)
    return repo ? resolveDefaultIssueTemplate(repo) : null
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
