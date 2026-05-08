import { BrowserWindow, MessageChannelMain, ipcMain } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { AgentEvent } from '@shared/types'
import type { PilogDatabase } from '../db/client'
import { createAgentRun, finalizeAgentRun } from '../db/repositories/agent-runs'
import { listIssueDrafts } from '../db/repositories/issue-drafts'
import { createNote } from '../db/repositories/notes'
import { createRepo } from '../db/repositories/repos'
import { getSetting, setSetting } from '../db/repositories/settings'
import { createSafeStorageAuthStorage } from '../pi/auth-storage'
import {
  getSelectedNotesForGeneration,
  getTurnBudget,
  persistGeneratedIssueDrafts,
  type RunAgent
} from '../pi/issue-generation'
import { runAgent } from '../pi/runtime'

type ActiveRun = {
  controller: AbortController
  finalized: boolean
  eventStream: unknown[]
}

const activeRuns = new Map<string, ActiveRun>()

export function registerPiIpcHandlers(
  db: PilogDatabase,
  options?: { onDraftsGenerated?: () => void; runAgentImpl?: RunAgent }
): void {
  const runAgentImpl = options?.runAgentImpl ?? runAgent

  ipcMain.handle('pi:status', (): IpcResponse<'pi:status'> => {
    const provider = getSetting(db, 'pi.activeProvider')
    const model = getSetting(db, 'pi.activeModel')
    if (!provider) return { configured: false, reason: 'missing-provider' }
    if (!model) return { configured: false, reason: 'missing-model' }

    const authStorage = createSafeStorageAuthStorage()
    return authStorage.hasAuth(provider)
      ? { configured: true }
      : { configured: false, reason: 'missing-credential' }
  })

  ipcMain.handle(
    'pi:generateDrafts:start',
    (
      event,
      request: IpcRequest<'pi:generateDrafts:start'>
    ): IpcResponse<'pi:generateDrafts:start'> => {
      const { repo, notes } = getSelectedNotesForGeneration(db, request.noteIds)
      if (!existsSync(repo.localPath))
        throw new Error('The linked repository path no longer exists.')

      const provider = getSetting(db, 'pi.activeProvider')
      const model = getSetting(db, 'pi.activeModel')
      if (!provider || !model)
        throw new Error('Configure Pi provider and model before generating drafts.')

      const authStorage = createSafeStorageAuthStorage()
      if (!authStorage.hasAuth(provider))
        throw new Error('Configure Pi credentials before generating drafts.')

      const run = createAgentRun(db, {
        repoId: repo.id,
        inputNoteIds: notes.map((note) => note.id)
      })
      const { port1, port2 } = new MessageChannelMain()
      const controller = new AbortController()
      const active: ActiveRun = { controller, finalized: false, eventStream: [] }
      activeRuns.set(run.id, active)

      event.sender.postMessage('pi:agent-stream', { runId: run.id }, [port2])
      port1.start()

      const webContents = event.sender
      const cancelIfDestroyed = (): void => {
        void cancelRun(db, run.id, 'Renderer window closed mid-run.')
      }
      webContents.once('destroyed', cancelIfDestroyed)

      void (async () => {
        try {
          for await (const agentEvent of runAgentImpl({
            runId: run.id,
            repo,
            notes,
            provider,
            model,
            turnBudget: getTurnBudget(db),
            signal: controller.signal
          })) {
            active.eventStream.push(agentEvent)
            if (controller.signal.aborted) break

            if (agentEvent.type === 'final') {
              persistGeneratedIssueDrafts(db, {
                runId: run.id,
                repoId: repo.id,
                selectedNoteIds: notes.map((note) => note.id),
                drafts: agentEvent.drafts,
                eventStream: active.eventStream
              })
              active.finalized = true
            }

            port1.postMessage(agentEvent)
          }
        } catch (error) {
          if (!active.finalized) {
            const message = error instanceof Error ? error.message : String(error)
            finalizeAgentRun(db, {
              id: run.id,
              status: controller.signal.aborted ? 'cancelled' : 'failed',
              errorMessage: message,
              errorCause: controller.signal.aborted ? 'cancelled' : 'unknown',
              eventStream: active.eventStream
            })
            const errorEvent: AgentEvent = {
              type: 'error',
              message,
              cause: controller.signal.aborted ? 'cancelled' : 'unknown'
            }
            port1.postMessage(errorEvent)
          }
        } finally {
          webContents.removeListener('destroyed', cancelIfDestroyed)
          activeRuns.delete(run.id)
          port1.close()
          options?.onDraftsGenerated?.()
          broadcastAgentRunsInvalidated()
        }
      })()

      return { runId: run.id }
    }
  )

  ipcMain.handle(
    'pi:generateDrafts:cancel',
    (_event, request: IpcRequest<'pi:generateDrafts:cancel'>) =>
      cancelRun(db, request.runId, 'Generation cancelled.')
  )

  if (process.env.PILOG_DEBUG_IPC === '1') {
    ipcMain.handle(
      'debug:seedIssueGenerationFixture',
      (_event, request: IpcRequest<'debug:seedIssueGenerationFixture'>) => {
        mkdirSync(request.repoPath, { recursive: true })
        const repo = createRepo(db, {
          name: 'fixture',
          owner: 'pilog',
          localPath: request.repoPath,
          githubUrl: 'https://github.com/pilog/fixture',
          defaultBranch: 'main'
        })
        const noteIds = request.notes.map(
          (content) => createNote(db, { content, repoId: repo.id }).id
        )

        setSetting(db, 'pi.activeProvider', 'pilog-fixture')
        setSetting(db, 'pi.activeModel', 'tracer')
        createSafeStorageAuthStorage().set('pilog-fixture', { type: 'api_key', key: 'fixture-key' })

        return { repoId: repo.id, noteIds }
      }
    )

    ipcMain.handle('debug:listIssueDrafts', () => listIssueDrafts(db))
  }
}

async function cancelRun(db: PilogDatabase, runId: string, message: string): Promise<void> {
  const active = activeRuns.get(runId)
  if (!active || active.finalized) return
  active.controller.abort()
  active.finalized = true
  finalizeAgentRun(db, {
    id: runId,
    status: 'cancelled',
    errorMessage: message,
    errorCause: 'cancelled',
    eventStream: active.eventStream
  })
  broadcastAgentRunsInvalidated()
}

function broadcastAgentRunsInvalidated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent-runs:invalidated')
  }
}
