import { ipcMain, app } from 'electron'
import type { IpcRequest, IpcResponse } from '@shared/ipc'
import type { PilogDatabase } from '../db/client'
import { getRunById, listRuns } from '../db/repositories/agent-runs'
import { createNote, listNotes, updateNote, deleteNote } from '../db/repositories/notes'
import { getSetting, setSetting } from '../db/repositories/settings'

type DbChannel =
  | 'agent-runs:get'
  | 'agent-runs:list'
  | 'note:create'
  | 'note:list'
  | 'note:update'
  | 'note:delete'
  | 'setting:get'
  | 'setting:set'

type Handler<C extends DbChannel> = (db: PilogDatabase, request: IpcRequest<C>) => IpcResponse<C>

const handlers: { [C in DbChannel]: Handler<C> } = {
  'agent-runs:get': (db, request) => getRunById(db, request.id),
  'agent-runs:list': (db, request) => listRuns(db, request ?? undefined),
  'note:create': (db, request) => createNote(db, request),
  'note:list': (db, request) => listNotes(db, request ?? undefined),
  'note:update': (db, request) => updateNote(db, request),
  'note:delete': (db, request) => deleteNote(db, request),
  'setting:get': (db, request) => getSetting(db, request.key),
  'setting:set': (db, request) => {
    setSetting(db, request.key, request.value)
    if (request.key === 'openInboxAtLogin') {
      app.setLoginItemSettings({ openAtLogin: request.value === 'true' })
    }
  }
}

export function registerIpcHandlers(
  db: PilogDatabase,
  options?: { onNoteCreated?: () => void }
): void {
  for (const channel of Object.keys(handlers) as DbChannel[]) {
    ipcMain.handle(channel, (_event, request) => {
      const handler = handlers[channel] as Handler<typeof channel>
      const result = handler(db, request)
      if (channel === 'note:create') options?.onNoteCreated?.()
      return result
    })
  }
}
