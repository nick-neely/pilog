export type Note = {
  id: string
  content: string
  status: 'unprocessed' | 'drafted' | 'published' | 'dismissed'
  createdAt: string
  updatedAt: string
}

export type IpcContract = {
  'note:create': { request: { content: string }; response: Note }
  'note:list': { request: void; response: Note[] }
  'note:update': { request: { id: string; content: string }; response: Note | null }
  'note:delete': { request: { id: string }; response: boolean }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

export type IpcEvent = 'note:created' | 'scratchpad:reset'

export type IpcAction = 'scratchpad:hide'
