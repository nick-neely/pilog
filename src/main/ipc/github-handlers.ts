import { ipcMain, shell } from 'electron'
import { startOAuthFlow, signOut, getGitHubStatus } from '../github/auth'
import { resetClient, listLabels, createIssue } from '../github/client'
import type { PilogDatabase } from '../db/client'
import type { CreateIssueRequest } from '@shared/ipc'
import { recordPublish } from '../db/repositories/publish-log'

export function registerGitHubIpcHandlers(
  options: { clientId: string; clientSecret: string },
  db: PilogDatabase
): void {
  ipcMain.handle('github:connect', async () => {
    return startOAuthFlow(options.clientId, options.clientSecret)
  })

  ipcMain.handle('github:signOut', () => {
    signOut()
    resetClient()
  })

  ipcMain.handle('github:status', () => {
    return getGitHubStatus()
  })

  ipcMain.handle(
    'github:listLabels',
    (_event, request: { owner: string; repo: string }) => {
      return listLabels(request.owner, request.repo)
    }
  )

  ipcMain.handle('github:createIssue', async (_event, request: CreateIssueRequest) => {
    const result = await createIssue(request.owner, request.repo, {
      title: request.title,
      body: request.body,
      labels: request.labels
    })

    recordPublish(db, {
      draftId: null,
      repoId: request.repoId,
      githubIssueUrl: result.url
    })

    await shell.openExternal(result.url)

    return result
  })
}
