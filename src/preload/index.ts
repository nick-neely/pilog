import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { createAsyncQueue } from '@shared/async-queue'
import type {
  AgentEvent,
  GenerateDraftsRequest,
  IpcAction,
  IpcChannel,
  IpcEvent,
  IpcRequest,
  IpcResponse
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
  send: (action: IpcAction): void => {
    ipcRenderer.send(action)
  },
  runAgent: async function* (input: GenerateDraftsRequest): AsyncIterable<AgentEvent> {
    const { runId } = await ipcRenderer.invoke('pi:generateDrafts:start', input)
    const port = await getStreamPort(runId)
    const queue = createAsyncQueue<AgentEvent>()

    port.onmessage = (event): void => {
      const agentEvent = event.data as AgentEvent
      queue.push(agentEvent)
      if (agentEvent.type === 'final' || agentEvent.type === 'error') queue.close()
    }
    port.start()

    for await (const event of queue) {
      yield event
    }
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
