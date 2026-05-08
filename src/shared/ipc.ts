export type NoteStatus = 'unprocessed' | 'drafted' | 'published' | 'dismissed'

export type Note = {
  id: string
  content: string
  status: NoteStatus
  repoId: string | null
  createdAt: string
  updatedAt: string
}

export type ListNotesRequest = {
  status?: NoteStatus
  search?: string
  repoId?: string | null
}

export type SettingKey = 'hotkey.scratchpad' | 'openInboxAtLogin' | 'scratchpad.lastRepoId'

export type GitHubStatus = { connected: boolean; login?: string }

export type GitHubRepo = {
  id: number
  name: string
  owner: string
  fullName: string
  url: string
  defaultBranch: string
}

export type Repo = {
  id: string
  name: string
  owner: string
  localPath: string
  githubUrl: string | null
  defaultBranch: string | null
  createdAt: string
  updatedAt: string
}

export type DetectLocalRepoResult =
  | { state: 'unauthenticated' }
  | { state: 'not-git' }
  | { state: 'no-remote' }
  | { state: 'unmatched'; remoteUrl: string }
  | {
      state: 'matched'
      remoteUrl: string
      defaultBranch: string
      headSha: string
      githubRepo: GitHubRepo
    }

export type LinkRepoRequest = {
  localPath: string
  githubRepo: GitHubRepo
  defaultBranch: string
}

export type IpcContract = {
  'note:create': { request: { content: string; repoId?: string | null }; response: Note }
  'note:list': { request: ListNotesRequest | void; response: Note[] }
  'note:update': { request: { id: string; content: string; repoId?: string | null }; response: Note | null }
  'note:delete': { request: { id: string }; response: boolean }
  'setting:get': { request: { key: SettingKey }; response: string | null }
  'setting:set': { request: { key: SettingKey; value: string }; response: void }
  'github:connect': { request: void; response: GitHubStatus }
  'github:signOut': { request: void; response: void }
  'github:status': { request: void; response: GitHubStatus }
  'repos:list': { request: void; response: Repo[] }
  'repos:detectLocal': { request: { localPath: string }; response: DetectLocalRepoResult }
  'repos:link': { request: LinkRepoRequest; response: Repo }
  'repos:unlink': { request: { id: string }; response: boolean }
  'dialog:openDirectory': { request: void; response: string | null }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

export type IpcEvent = 'note:created' | 'scratchpad:reset' | 'navigate:inbox' | 'navigate:settings'

export type IpcAction = 'scratchpad:hide'
