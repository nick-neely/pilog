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
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']
