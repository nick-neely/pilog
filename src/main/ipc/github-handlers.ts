import { ipcMain } from 'electron'
import { startOAuthFlow, signOut, getGitHubStatus } from '../github/auth'
import { resetClient } from '../github/client'

export function registerGitHubIpcHandlers(options: {
  clientId: string
  clientSecret: string
}): void {
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
}
