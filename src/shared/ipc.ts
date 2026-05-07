export type NoteStatus = 'unprocessed' | 'drafted' | 'published' | 'dismissed'

export type Note = {
  id: string
  content: string
  status: NoteStatus
  createdAt: string
  updatedAt: string
}

export type ListNotesRequest = {
  status?: NoteStatus
  search?: string
}

export type SettingKey = 'hotkey.scratchpad' | 'openInboxAtLogin'

export type IpcContract = {
  'note:create': { request: { content: string }; response: Note }
  'note:list': { request: ListNotesRequest | void; response: Note[] }
  'note:update': { request: { id: string; content: string }; response: Note | null }
  'note:delete': { request: { id: string }; response: boolean }
  'setting:get': { request: { key: SettingKey }; response: string | null }
  'setting:set': { request: { key: SettingKey; value: string }; response: void }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

export type IpcEvent = 'note:created' | 'scratchpad:reset' | 'navigate:inbox' | 'navigate:settings'

export type IpcAction = 'scratchpad:hide'
