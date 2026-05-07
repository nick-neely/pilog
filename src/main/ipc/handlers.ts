import { ipcMain } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc'
import type { PilogDatabase } from '../db/client'
import { createNote, listNotes } from '../db/repositories/notes'

type Handler<C extends IpcChannel> = (db: PilogDatabase, request: IpcRequest<C>) => IpcResponse<C>

const handlers: { [C in IpcChannel]: Handler<C> } = {
  'note:create': (db, request) => createNote(db, request),
  'note:list': (db) => listNotes(db)
}

export function registerIpcHandlers(db: PilogDatabase): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    ipcMain.handle(channel, (_event, request) => {
      const handler = handlers[channel] as Handler<typeof channel>
      return handler(db, request)
    })
  }
}
