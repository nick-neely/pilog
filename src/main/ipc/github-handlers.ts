import { ipcMain, shell } from 'electron'
import {
  startDeviceFlow,
  startOAuthFlow,
  signOut,
  getGitHubStatus,
  type GitHubAuthRuntimeOptions
} from '../github/auth'
import { resetClient, listLabels, createIssue } from '../github/client'
import type { PilogDatabase } from '../db/client'
import type { CreateIssueRequest } from '@shared/ipc'
import { recordPublish } from '../db/repositories/publish-log'
import { publishAutoPublishRun, publishReviewedDraft } from '../github/publish-draft'

export function registerGitHubIpcHandlers(
  options: GitHubAuthRuntimeOptions,
  db: PilogDatabase,
  callbacks?: { onIssueDraftsChanged?: () => void; onNoteChanged?: () => void }
): void {
  let activeDeviceFlow: AbortController | null = null

  ipcMain.handle('github:connect', async (event) => {
    if (options.authFlow === 'loopback') {
      return startOAuthFlow(options.clientId, options.clientSecret)
    }

    const controller = new AbortController()
    activeDeviceFlow?.abort()
    activeDeviceFlow = controller

    try {
      return await startDeviceFlow(options.clientId, {
        signal: controller.signal,
        onProgress: (progress) => {
          event.sender.send('github:authProgress', progress)
        }
      })
    } finally {
      if (activeDeviceFlow === controller) {
        activeDeviceFlow = null
      }
    }
  })

  ipcMain.handle('github:cancelConnect', () => {
    activeDeviceFlow?.abort()
  })

  ipcMain.handle('github:signOut', () => {
    signOut()
    resetClient()
  })

  ipcMain.handle('github:status', () => {
    return getGitHubStatus()
  })

  ipcMain.handle('github:listLabels', (_event, request: { owner: string; repo: string }) => {
    return listLabels(request.owner, request.repo)
  })

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

    await openBrowserUrl(result.url)

    return result
  })

  ipcMain.handle('issue-drafts:publish', async (_event, request) => {
    const published = await publishReviewedDraft(db, request, { createIssue, listLabels })

    callbacks?.onIssueDraftsChanged?.()
    callbacks?.onNoteChanged?.()

    if (published.githubIssueUrl) await openBrowserUrl(published.githubIssueUrl)

    return published
  })

  ipcMain.handle('issue-drafts:publishAutoPublishRun', async (_event, request) => {
    const report = await publishAutoPublishRun(db, request, { createIssue, listLabels })

    callbacks?.onIssueDraftsChanged?.()
    callbacks?.onNoteChanged?.()

    return report
  })
}

async function openBrowserUrl(url: string): Promise<void> {
  const scheme = new URL(url).protocol
  if (scheme === 'https:' || scheme === 'http:') {
    await shell.openExternal(url)
  }
}
