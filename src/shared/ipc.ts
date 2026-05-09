import type {
  AgentEvent,
  AgentRunDetail,
  AgentRunListItem,
  AgentRunStatus,
  AdvancedSettings,
  GenerateDraftsRequest,
  GenerateDraftsStartResponse,
  PiActiveConfig,
  PiModelOption,
  PiProviderOption,
  IssueDraft,
  IssueDraftForReview,
  IssueDraftStatus,
  SearchProvider,
  SetAdvancedSettingsRequest,
  PiStatus
} from './types'

export type NoteStatus = 'unprocessed' | 'drafted' | 'published' | 'dismissed'

export type Note = {
  id: string
  content: string
  status: NoteStatus
  repoId: string | null
  runId: string | null
  createdAt: string
  updatedAt: string
}

export type ListNotesRequest = {
  status?: NoteStatus
  search?: string
  repoId?: string | null
}

/**
 * Status totals for the inbox sidebar's status filter. Counts honour the
 * caller's non-status filters (search, repoId) so each row reads as the
 * answer to "how many of these would I see if I picked this status next?"
 */
export type NoteStatusCounts = Record<NoteStatus, number>

export type CountNotesRequest = {
  search?: string
  repoId?: string | null
}

export type SettingKey =
  | 'hotkey.scratchpad'
  | 'openInboxAtLogin'
  | 'scratchpad.lastRepoId'
  | 'pi.activeProvider'
  | 'pi.activeModel'
  | 'pi.turnBudget'
  | 'pi.webSearchEnabled'
  | 'pi.webSearchProvider'

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

export type GitHubLabel = {
  id: number
  name: string
  color: string
  description: string | null
}

export type CreateIssueRequest = {
  owner: string
  repo: string
  repoId: string
  title: string
  body: string
  labels?: string[]
}

export type CreatedIssue = {
  url: string
  number: number
}

export type PublishLogEntry = {
  id: string
  draftId: string | null
  repoId: string
  githubIssueUrl: string
  publishedAt: string
}

export type UpdateIssueDraftRequest = {
  id: string
  title: string
  body: string
  labels: string[]
}

export type PathActionRequest = {
  path: string
  repoPath?: string | null
}

export type PathActionResult = { ok: true } | { ok: false; reason: 'missing' | 'unavailable' }

export type ListIssueDraftsRequest = {
  status?: IssueDraftStatus | 'all'
}

export type UpdateIssueDraftStatusRequest = {
  id: string
  status: IssueDraftStatus
}

export type MergeIssueDraftsRequest = {
  targetId: string
  sourceId: string
}

export type PublishIssueDraftRequest = UpdateIssueDraftRequest

export type IpcContract = {
  'note:create': { request: { content: string; repoId?: string | null }; response: Note }
  'note:list': { request: ListNotesRequest | void; response: Note[] }
  'note:counts': { request: CountNotesRequest | void; response: NoteStatusCounts }
  'note:update': {
    request: { id: string; content: string; repoId?: string | null }
    response: Note | null
  }
  'note:delete': { request: { id: string }; response: boolean }
  'setting:get': { request: { key: SettingKey }; response: string | null }
  'setting:set': { request: { key: SettingKey; value: string }; response: void }
  'settings:getAdvanced': { request: void; response: AdvancedSettings }
  'settings:setAdvanced': { request: SetAdvancedSettingsRequest; response: AdvancedSettings }
  'github:connect': { request: void; response: GitHubStatus }
  'github:signOut': { request: void; response: void }
  'github:status': { request: void; response: GitHubStatus }
  'repos:list': { request: void; response: Repo[] }
  'repos:detectLocal': { request: { localPath: string }; response: DetectLocalRepoResult }
  'repos:link': { request: LinkRepoRequest; response: Repo }
  'repos:unlink': { request: { id: string }; response: boolean }
  'dialog:openDirectory': { request: void; response: string | null }
  'github:listLabels': {
    request: { owner: string; repo: string }
    response: GitHubLabel[]
  }
  'github:createIssue': {
    request: CreateIssueRequest
    response: CreatedIssue
  }
  'pi:status': { request: void; response: PiStatus }
  'pi:getActiveConfig': { request: void; response: PiActiveConfig }
  'pi:setActiveConfig': {
    request: { provider: string; modelId: string; apiKey?: string }
    response: PiActiveConfig
  }
  'pi:listProviders': { request: void; response: PiProviderOption[] }
  'pi:listModels': { request: { provider?: string } | void; response: PiModelOption[] }
  'pi:importExistingPiConfig': { request: void; response: PiActiveConfig }
  'pi:resetConfig': { request: void; response: PiActiveConfig }
  'pi:generateDrafts:start': {
    request: GenerateDraftsRequest
    response: GenerateDraftsStartResponse
  }
  'pi:generateDrafts:cancel': { request: { runId: string }; response: void }
  'agent-runs:list': {
    request: { status?: AgentRunStatus; limit?: number } | void
    response: AgentRunListItem[]
  }
  'agent-runs:get': {
    request: { id: string }
    response: AgentRunDetail | null
  }
  'issue-drafts:list': {
    request: ListIssueDraftsRequest | void
    response: IssueDraftForReview[]
  }
  'issue-drafts:update': {
    request: UpdateIssueDraftRequest
    response: IssueDraft | null
  }
  'issue-drafts:updateStatus': {
    request: UpdateIssueDraftStatusRequest
    response: IssueDraft | null
  }
  'issue-drafts:merge': {
    request: MergeIssueDraftsRequest
    response: IssueDraft | null
  }
  'issue-drafts:publish': {
    request: PublishIssueDraftRequest
    response: IssueDraft
  }
  'path:copy': {
    request: PathActionRequest
    response: PathActionResult
  }
  'path:reveal': {
    request: PathActionRequest
    response: PathActionResult
  }
  'debug:seedIssueGenerationFixture': {
    request: { repoPath: string; notes: string[] }
    response: { repoId: string; noteIds: string[] }
  }
  'debug:listIssueDrafts': { request: void; response: IssueDraft[] }
}

export type IpcChannel = keyof IpcContract
export type IpcRequest<C extends IpcChannel> = IpcContract[C]['request']
export type IpcResponse<C extends IpcChannel> = IpcContract[C]['response']

export type IpcEvent =
  | 'note:created'
  | 'scratchpad:reset'
  | 'navigate:inbox'
  | 'navigate:settings'
  | 'agent-runs:invalidated'
  | 'issue-drafts:invalidated'

export type IpcAction = 'scratchpad:hide'

export type {
  AgentEvent,
  AgentRunDetail,
  AgentRunListItem,
  AgentRunStatus,
  GenerateDraftsRequest,
  AdvancedSettings,
  PiActiveConfig,
  PiModelOption,
  PiProviderOption,
  PiStatus,
  IssueDraftStatus,
  SearchProvider,
  SetAdvancedSettingsRequest
}
