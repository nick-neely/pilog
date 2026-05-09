import { BrowserWindow, MessageChannelMain, ipcMain } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { AgentEvent, ErrorCause } from '@shared/types'
import type { PilogDatabase } from '../db/client'
import {
  createAgentRun,
  finalizeAgentRun,
  updateAgentRunEventStream
} from '../db/repositories/agent-runs'
import { listIssueDrafts } from '../db/repositories/issue-drafts'
import { createNote } from '../db/repositories/notes'
import { createRepo } from '../db/repositories/repos'
import { getSetting, setSetting } from '../db/repositories/settings'
import {
  getActivePiConfig,
  importExistingPiConfig,
  listPiModels,
  listPiProviders,
  resetPiConfig,
  setActivePiConfig
} from '../pi/config'
import { createSafeStorageAuthStorage } from '../pi/auth-storage'
import { setSecret } from '../security/secrets'
import {
  getAdvancedSettings,
  getTurnBudget,
  getWebSearchConfig,
  setAdvancedSettings
} from '../pi/advanced-config'
import {
  getSelectedNotesForGeneration,
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
const DEFAULT_AGENT_RUN_TIMEOUT_MS = 10 * 60 * 1000

export function registerPiIpcHandlers(
  db: PilogDatabase,
  options?: { onDraftsGenerated?: () => void; runAgentImpl?: RunAgent; runTimeoutMs?: number }
): void {
  const runAgentImpl = options?.runAgentImpl ?? runAgent
  const runTimeoutMs = options?.runTimeoutMs ?? DEFAULT_AGENT_RUN_TIMEOUT_MS

  ipcMain.handle('pi:status', async (): Promise<IpcResponse<'pi:status'>> => {
    const provider = getSetting(db, 'pi.activeProvider')
    const model = getSetting(db, 'pi.activeModel')
    if (!provider) return { configured: false, reason: 'missing-provider' }
    if (!model) return { configured: false, reason: 'missing-model' }

    const authStorage = await createSafeStorageAuthStorage()
    return authStorage.hasAuth(provider)
      ? { configured: true }
      : { configured: false, reason: 'missing-credential' }
  })

  ipcMain.handle('pi:getActiveConfig', async (): Promise<IpcResponse<'pi:getActiveConfig'>> => {
    return await getActivePiConfig(db)
  })

  ipcMain.handle('settings:getAdvanced', async (): Promise<IpcResponse<'settings:getAdvanced'>> => {
    return await getAdvancedSettings(db)
  })

  ipcMain.handle(
    'settings:setAdvanced',
    async (
      _event,
      request: IpcRequest<'settings:setAdvanced'>
    ): Promise<IpcResponse<'settings:setAdvanced'>> => {
      return await setAdvancedSettings(db, request)
    }
  )

  ipcMain.handle(
    'pi:setActiveConfig',
    async (
      _event,
      request: IpcRequest<'pi:setActiveConfig'>
    ): Promise<IpcResponse<'pi:setActiveConfig'>> => {
      return await setActivePiConfig(db, request)
    }
  )

  ipcMain.handle('pi:listProviders', async (): Promise<IpcResponse<'pi:listProviders'>> => {
    return await listPiProviders()
  })

  ipcMain.handle(
    'pi:listModels',
    async (
      _event,
      request?: IpcRequest<'pi:listModels'>
    ): Promise<IpcResponse<'pi:listModels'>> => {
      return await listPiModels(request?.provider)
    }
  )

  ipcMain.handle(
    'pi:importExistingPiConfig',
    async (): Promise<IpcResponse<'pi:importExistingPiConfig'>> => {
      return await importExistingPiConfig(db)
    }
  )

  ipcMain.handle('pi:resetConfig', async (): Promise<IpcResponse<'pi:resetConfig'>> => {
    return await resetPiConfig(db)
  })

  ipcMain.handle(
    'pi:generateDrafts:start',
    async (
      event,
      request: IpcRequest<'pi:generateDrafts:start'>
    ): Promise<IpcResponse<'pi:generateDrafts:start'>> => {
      const { repo, notes } = getSelectedNotesForGeneration(db, request.noteIds)
      if (!existsSync(repo.localPath))
        throw new Error('The linked repository path no longer exists.')

      const provider = getSetting(db, 'pi.activeProvider')
      const model = getSetting(db, 'pi.activeModel')
      if (!provider || !model)
        throw new Error('Configure Pi provider and model before generating drafts.')

      const authStorage = await createSafeStorageAuthStorage()
      if (!authStorage.hasAuth(provider))
        throw new Error('Configure Pi credentials before generating drafts.')

      const run = createAgentRun(db, {
        repoId: repo.id,
        inputNoteIds: notes.map((note) => note.id)
      })
      broadcastAgentRunsInvalidated()
      const { port1, port2 } = new MessageChannelMain()
      const controller = new AbortController()
      const active: ActiveRun = { controller, finalized: false, eventStream: [] }
      activeRuns.set(run.id, active)
      appendAgentEvent(db, run.id, active, { type: 'progress', phase: 'agent_start' })

      event.sender.postMessage('pi:agent-stream', { runId: run.id }, [port2])
      port1.start()

      const webContents = event.sender
      const cancelIfDestroyed = (): void => {
        void cancelRun(db, run.id, 'Renderer window closed mid-run.')
      }
      webContents.once('destroyed', cancelIfDestroyed)
      const runTimeout = setTimeout(() => {
        if (!active.finalized) controller.abort('timeout')
      }, runTimeoutMs)

      void (async () => {
        try {
          const webSearch = await getWebSearchConfig(db)
          for await (const agentEvent of runAgentImpl({
            runId: run.id,
            repo,
            notes,
            provider,
            model,
            turnBudget: getTurnBudget(db),
            webSearch: webSearch.enabled ? webSearch : undefined,
            signal: controller.signal
          })) {
            if (active.finalized) break
            appendAgentEvent(db, run.id, active, agentEvent)

            if (agentEvent.type === 'final') {
              try {
                persistGeneratedIssueDrafts(db, {
                  runId: run.id,
                  repoId: repo.id,
                  selectedNoteIds: notes.map((note) => note.id),
                  drafts: agentEvent.drafts,
                  eventStream: active.eventStream
                })
                active.finalized = true
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                const errorEvent: AgentEvent = {
                  type: 'error',
                  message,
                  cause: 'persistence'
                }
                appendAgentEvent(db, run.id, active, errorEvent)
                finalizeAgentRun(db, {
                  id: run.id,
                  status: 'failed',
                  errorMessage: message,
                  errorCause: 'persistence',
                  eventStream: active.eventStream
                })
                active.finalized = true
                port1.postMessage(errorEvent)
                break
              }
            }

            if (agentEvent.type === 'error' && !active.finalized) {
              finalizeAgentRun(db, {
                id: run.id,
                status: agentEvent.cause === 'cancelled' ? 'cancelled' : 'failed',
                errorMessage: agentEvent.message,
                errorCause: agentEvent.cause,
                eventStream: active.eventStream
              })
              active.finalized = true
            }

            port1.postMessage(agentEvent)
          }

          if (!active.finalized) {
            const cause = getAbortCause(controller.signal) ?? 'pi_internal'
            const errorEvent: AgentEvent = {
              type: 'error',
              message:
                cause === 'timeout'
                  ? `Generation timed out after ${formatDuration(runTimeoutMs)}.`
                  : cause === 'cancelled'
                    ? 'Generation cancelled.'
                    : 'Pi ended without returning issue drafts.',
              cause
            }
            appendAgentEvent(db, run.id, active, errorEvent)
            finalizeAgentRun(db, {
              id: run.id,
              status: cause === 'cancelled' ? 'cancelled' : 'failed',
              errorMessage: errorEvent.message,
              errorCause: cause,
              eventStream: active.eventStream
            })
            active.finalized = true
            port1.postMessage(errorEvent)
          }
        } catch (error) {
          if (!active.finalized) {
            const message = error instanceof Error ? error.message : String(error)
            const cause = getAbortCause(controller.signal) ?? 'unknown'
            const errorEvent: AgentEvent = {
              type: 'error',
              message,
              cause
            }
            appendAgentEvent(db, run.id, active, errorEvent)
            finalizeAgentRun(db, {
              id: run.id,
              status: cause === 'cancelled' ? 'cancelled' : 'failed',
              errorMessage: message,
              errorCause: cause,
              eventStream: active.eventStream
            })
            port1.postMessage(errorEvent)
          }
        } finally {
          clearTimeout(runTimeout)
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
      async (_event, request: IpcRequest<'debug:seedIssueGenerationFixture'>) => {
        mkdirSync(request.repoPath, { recursive: true })
        const owner = request.githubOwner?.trim() || 'pilog'
        const name = request.githubRepo?.trim() || 'fixture'
        const repo = createRepo(db, {
          name,
          owner,
          localPath: request.repoPath,
          githubUrl: `https://github.com/${owner}/${name}`,
          defaultBranch: 'main'
        })
        const noteIds = request.notes.map(
          (content) => createNote(db, { content, repoId: repo.id }).id
        )

        setSetting(db, 'pi.activeProvider', 'pilog-fixture')
        setSetting(db, 'pi.activeModel', 'tracer')
        ;(await createSafeStorageAuthStorage()).set('pilog-fixture', {
          type: 'api_key',
          key: 'fixture-key'
        })

        return { repoId: repo.id, noteIds }
      }
    )

    ipcMain.handle('debug:setGitHubAuth', (_event, request: IpcRequest<'debug:setGitHubAuth'>) => {
      setSecret('github_token', request.token)
      if (request.login) setSecret('github_login', request.login)
    })

    ipcMain.handle('debug:listIssueDrafts', () => listIssueDrafts(db, { status: 'all' }))
  }
}

async function cancelRun(db: PilogDatabase, runId: string, message: string): Promise<void> {
  const active = activeRuns.get(runId)
  if (!active || active.finalized) return
  active.controller.abort('cancelled')
  appendAgentEvent(db, runId, active, { type: 'error', message, cause: 'cancelled' })
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

function appendAgentEvent(
  db: PilogDatabase,
  runId: string,
  active: ActiveRun,
  agentEvent: AgentEvent
): void {
  active.eventStream.push(agentEvent)
  updateAgentRunEventStream(db, { id: runId, eventStream: active.eventStream })
  if (agentEvent.type !== 'partial') broadcastAgentRunsInvalidated()
}

function getAbortCause(signal: AbortSignal): Extract<ErrorCause, 'cancelled' | 'timeout'> | null {
  if (!signal.aborted) return null
  return signal.reason === 'timeout' ? 'timeout' : 'cancelled'
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(1, Math.round(ms / 1000))
  if (totalSeconds < 60) return `${totalSeconds} seconds`
  const minutes = Math.round(totalSeconds / 60)
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

function broadcastAgentRunsInvalidated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('agent-runs:invalidated')
  }
}
