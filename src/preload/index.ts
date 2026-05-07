import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { IpcChannel, IpcRequest, IpcResponse, IpcEvent, IpcAction } from '../shared/ipc'

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
