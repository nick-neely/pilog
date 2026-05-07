import { ipcMain } from 'electron'
import type { IpcChannel, IpcRequest, IpcResponse } from '@shared/ipc'
import type { PilogDatabase } from '../db/client'
import { createNote, listNotes, updateNote, deleteNote } from '../db/repositories/notes'

type Handler<C extends IpcChannel> = (db: PilogDatabase, request: IpcRequest<C>) => IpcResponse<C>

const handlers: { [C in IpcChannel]: Handler<C> } = {
  'note:create': (db, request) => createNote(db, request),
  'note:list': (db, request) => listNotes(db, request ?? undefined),
  'note:update': (db, request) => updateNote(db, request),
  'note:delete': (db, request) => deleteNote(db, request)
}

export function registerIpcHandlers(
  db: PilogDatabase,
  options?: { onNoteCreated?: () => void }
): void {
  for (const channel of Object.keys(handlers) as IpcChannel[]) {
    ipcMain.handle(channel, (_event, request) => {
      const handler = handlers[channel] as Handler<typeof channel>
      const result = handler(db, request)
      if (channel === 'note:create') options?.onNoteCreated?.()
      return result
    })
  }
}
