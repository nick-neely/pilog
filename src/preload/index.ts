import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { createAsyncQueue } from '@shared/async-queue'
import type {
  AgentEvent,
  GenerateCurrentInboxDraftsRequest,
  GenerateCurrentInboxDraftsStartResponse,
  GenerateDraftsRequest,
  IpcAction,
  IpcChannel,
  IpcEvent,
  IpcRequest,
  IpcResponse,
  AppUpdateStatus,
  GitHubAuthProgress
} from '../shared/ipc'

const streamPorts = new Map<string, MessagePort>()
const streamWaiters = new Map<string, (port: MessagePort) => void>()

ipcRenderer.on('pi:agent-stream', (event, payload: { runId: string }) => {
  const [port] = event.ports
  if (!port) return

  const waiter = streamWaiters.get(payload.runId)
  if (waiter) {
    streamWaiters.delete(payload.runId)
    waiter(port)
  } else {
    streamPorts.set(payload.runId, port)
  }
})

const pilog = {
  invoke: <C extends IpcChannel>(channel: C, request?: IpcRequest<C>): Promise<IpcResponse<C>> =>
    ipcRenderer.invoke(channel, request),
  on: (event: IpcEvent, callback: () => void): (() => void) => {
    const listener = (): void => callback()
    ipcRenderer.on(event, listener)
    return () => {
      ipcRenderer.removeListener(event, listener)
    }
  },
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: AppUpdateStatus): void => {
      callback(status)
    }
    ipcRenderer.on('app-updates:status', listener)
    return () => {
      ipcRenderer.removeListener('app-updates:status', listener)
    }
  },
  onGitHubAuthProgress: (callback: (progress: GitHubAuthProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: GitHubAuthProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('github:authProgress', listener)
    return () => {
      ipcRenderer.removeListener('github:authProgress', listener)
    }
  },
  send: (action: IpcAction): void => {
    ipcRenderer.send(action)
  },
  runAgent: async function (
    input: GenerateDraftsRequest,
    onEvent: (event: AgentEvent) => void | Promise<void>
  ): Promise<void> {
    const { runId } = await ipcRenderer.invoke('pi:generateDrafts:start', input)
    await consumeAgentStream(runId, onEvent)
  },
  runCurrentInboxAgent: async function (
    input: GenerateCurrentInboxDraftsRequest,
    onEvent: (event: AgentEvent) => void | Promise<void>
  ): Promise<GenerateCurrentInboxDraftsStartResponse> {
    const start = (await ipcRenderer.invoke(
      'pi:generateCurrentInboxDrafts:start',
      input
    )) as GenerateCurrentInboxDraftsStartResponse
    if ('skipped' in start) return start
    await consumeAgentStream(start.runId, onEvent)
    return start
  }
}

export type PilogApi = typeof pilog

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('pilog', pilog)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.pilog = pilog
}

function getStreamPort(runId: string): Promise<MessagePort> {
  const existing = streamPorts.get(runId)
  if (existing) {
    streamPorts.delete(runId)
    return Promise.resolve(existing)
  }

  return new Promise((resolve) => {
    streamWaiters.set(runId, resolve)
  })
}

async function consumeAgentStream(
  runId: string,
  onEvent: (event: AgentEvent) => void | Promise<void>
): Promise<void> {
  const port = await getStreamPort(runId)
  const queue = createAsyncQueue<AgentEvent>()

  port.onmessage = (event): void => {
    const agentEvent = event.data as AgentEvent
    queue.push(agentEvent)
    if (agentEvent.type === 'final' || agentEvent.type === 'error') queue.close()
  }
  port.start()

  for await (const event of queue) {
    await onEvent(event)
  }
}
