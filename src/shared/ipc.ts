import type {
  AdvancedSettings,
  AgentEvent,
  AgentRunDetail,
  AgentRunListItem,
  AgentRunStatus,
  AgentRunStatusCounts,
  AutoPublishPublishReport,
  AutoPublishPreviewSummary,
  GenerateCurrentInboxDraftsRequest,
  GenerateCurrentInboxDraftsStartResponse,
  GenerateDraftsRequest,
  GenerateDraftsMode,
  GenerateDraftsStartResponse,
  GitHubIssueTemplate,
  IssueDraftSourceNote,
  IssueDraft,
  IssueDraftForReview,
  IssueDraftStatus,
  OnboardingState,
  PiActiveConfig,
  PiModelOption,
  PiProviderOption,
  PiStatus,
  SearchProvider,
  SetAdvancedSettingsRequest
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
  | 'onboarding.state'
  | 'openInboxAtLogin'
  | 'scratchpad.lastRepoId'
  | 'pi.activeProvider'
  | 'pi.activeModel'
  | 'pi.turnBudget'
  | 'pi.webSearchEnabled'
  | 'pi.webSearchProvider'

export type GitHubAuthProgress =
  | {
      state: 'device_code'
      userCode: string
      verificationUri: string
      expiresAt: string
      intervalSeconds: number
    }
  | { state: 'polling'; message: string }
  | { state: 'slow_down'; intervalSeconds: number; message: string }
  | { state: 'authorized'; login: string }
  | { state: 'denied'; message: string }
  | { state: 'expired'; message: string }
  | { state: 'cancelled'; message: string }
  | { state: 'network_error'; message: string }

export type GitHubStatus = { connected: boolean; login?: string; auth?: GitHubAuthProgress }

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
  githubLabels: GitHubLabel[]
  githubLabelsSyncedAt: string | null
  autoPublishEnabled: boolean
  autoPublishMaxIssuesPerRun: number
  autoPublishDefaultLabel: string
  autoPublishDryRun: boolean
  autoPublishRequireConfirmation: boolean
  createdAt: string
  updatedAt: string
}

export type RepoAutoPublishSettings = Pick<
  Repo,
  | 'autoPublishEnabled'
  | 'autoPublishMaxIssuesPerRun'
  | 'autoPublishDefaultLabel'
  | 'autoPublishDryRun'
  | 'autoPublishRequireConfirmation'
>

export const DEFAULT_REPO_AUTO_PUBLISH_SETTINGS = {
  autoPublishEnabled: false,
  autoPublishMaxIssuesPerRun: 5,
  autoPublishDefaultLabel: 'triaged-by-pilog',
  autoPublishDryRun: false,
  autoPublishRequireConfirmation: true
} as const satisfies RepoAutoPublishSettings

export function normalizeRepoAutoPublishSettings(
  input: RepoAutoPublishSettings
): RepoAutoPublishSettings {
  const maxIssuesPerRun = Number.isFinite(input.autoPublishMaxIssuesPerRun)
    ? Math.max(1, Math.floor(input.autoPublishMaxIssuesPerRun))
    : 1

  return {
    autoPublishEnabled: input.autoPublishEnabled,
    autoPublishMaxIssuesPerRun: maxIssuesPerRun,
    autoPublishDefaultLabel:
      input.autoPublishDefaultLabel.trim() ||
      DEFAULT_REPO_AUTO_PUBLISH_SETTINGS.autoPublishDefaultLabel,
    autoPublishDryRun: input.autoPublishDryRun,
    autoPublishRequireConfirmation: input.autoPublishRequireConfirmation
  }
}

export type UpdateRepoAutoPublishSettingsRequest = {
  id: string
} & RepoAutoPublishSettings

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

export type RuntimeHealthCheck = {
  appId: string
  expectedProductName: string
  productName: string
  packaged: boolean
  defaultApp: boolean
  resourcesPath: string
  iconPath: string
  iconExists: boolean
  iconFilename: string
  sqlite: { ok: boolean; error?: string }
  piAgentCore: { ok: boolean; error?: string }
  piAi: { ok: boolean; error?: string }
  ripgrep: { ok: boolean; path: string; fromAsarUnpacked: boolean }
  boilerplateFree: { appId: boolean; productName: boolean }
}

export type PublishLogEntry = {
  id: string
  draftId: string | null
  repoId: string
  githubIssueUrl: string
  publishedAt: string
}

export type PublishAuditLogEntry = PublishLogEntry & {
  repo: Repo
  draftTitle: string | null
  sourceNotes: IssueDraftSourceNote[]
}

export type UpdateIssueDraftRequest = {
  id: string
  title: string
  body: string
  labels: string[]
  keptUnmatchedLabels?: string[]
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

export type SplitIssueDraftRequest = {
  id: string
  movedSourceNoteIds: string[]
}

export type SplitIssueDraftResponse = {
  original: IssueDraft
  newDraft: IssueDraft
}

export type MergeIssueDraftsRequest = {
  targetId: string
  sourceId: string
}

export type PublishIssueDraftRequest = UpdateIssueDraftRequest

export type PublishAutoPublishRunRequest = {
  runId: string
}

export type AppUpdateChannel = 'stable' | 'preview'

export type AppUpdateState =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'not-available'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export type AppUpdateStatus = {
  state: AppUpdateState
  version: string
  channel: AppUpdateChannel
  channelLabel: string
  updateVersion: string | null
  lastCheckedAt: string | null
  errorMessage: string | null
  disabledReason: 'development' | 'unpackaged' | null
}

export type IpcContract = {
  'note:create': { request: { content: string; repoId?: string | null }; response: Note }
  'note:list': { request: ListNotesRequest | undefined; response: Note[] }
  'note:counts': { request: CountNotesRequest | undefined; response: NoteStatusCounts }
  'note:update': {
    request: { id: string; content: string; repoId?: string | null }
    response: Note | null
  }
  'note:delete': { request: { id: string }; response: boolean }
  'setting:get': { request: { key: SettingKey }; response: string | null }
  'setting:set': { request: { key: SettingKey; value: string }; response: void }
  'onboarding:get': { request: void; response: OnboardingState }
  'onboarding:set': { request: OnboardingState; response: OnboardingState }
  'settings:getAdvanced': { request: void; response: AdvancedSettings }
  'settings:setAdvanced': { request: SetAdvancedSettingsRequest; response: AdvancedSettings }
  'github:connect': { request: void; response: GitHubStatus }
  'github:cancelConnect': { request: void; response: void }
  'github:signOut': { request: void; response: void }
  'github:status': { request: void; response: GitHubStatus }
  'repos:list': { request: void; response: Repo[] }
  'repos:detectLocal': { request: { localPath: string }; response: DetectLocalRepoResult }
  'repos:link': { request: LinkRepoRequest; response: Repo }
  'repos:updateAutoPublishSettings': {
    request: UpdateRepoAutoPublishSettingsRequest
    response: Repo | null
  }
  'repos:getDefaultIssueTemplate': {
    request: { id: string }
    response: GitHubIssueTemplate | null
  }
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
  'pi:listModels': { request: { provider?: string } | undefined; response: PiModelOption[] }
  'pi:importExistingPiConfig': { request: void; response: PiActiveConfig }
  'pi:resetConfig': { request: void; response: PiActiveConfig }
  'pi:generateDrafts:start': {
    request: GenerateDraftsRequest
    response: GenerateDraftsStartResponse
  }
  'pi:generateCurrentInboxDrafts:start': {
    request: GenerateCurrentInboxDraftsRequest
    response: GenerateCurrentInboxDraftsStartResponse
  }
  'pi:generateDrafts:cancel': { request: { runId: string }; response: void }
  'agent-runs:list': {
    request: { status?: AgentRunStatus; limit?: number } | undefined
    response: AgentRunListItem[]
  }
  'agent-runs:counts': { request: void; response: AgentRunStatusCounts }
  'agent-runs:get': {
    request: { id: string }
    response: AgentRunDetail | null
  }
  'issue-drafts:list': {
    request: ListIssueDraftsRequest | undefined
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
  'issue-drafts:split': {
    request: SplitIssueDraftRequest
    response: SplitIssueDraftResponse
  }
  'issue-drafts:publish': {
    request: PublishIssueDraftRequest
    response: IssueDraft
  }
  'issue-drafts:publishAutoPublishRun': {
    request: PublishAutoPublishRunRequest
    response: AutoPublishPublishReport
  }
  'publish-log:list': {
    request: { repoId?: string } | undefined
    response: PublishAuditLogEntry[]
  }
  'app-updates:getStatus': { request: void; response: AppUpdateStatus }
  'app-updates:check': { request: void; response: AppUpdateStatus }
  'app-updates:download': { request: void; response: AppUpdateStatus }
  'app-updates:restart': { request: void; response: AppUpdateStatus }
  'path:copy': {
    request: PathActionRequest
    response: PathActionResult
  }
  'path:reveal': {
    request: PathActionRequest
    response: PathActionResult
  }
  'debug:seedIssueGenerationFixture': {
    request: { repoPath: string; notes: string[]; githubOwner?: string; githubRepo?: string }
    response: { repoId: string; noteIds: string[] }
  }
  'debug:setGitHubAuth': {
    request: { token: string; login?: string }
    response: void
  }
  'debug:runtimeHealth': { request: void; response: RuntimeHealthCheck }
  'debug:listIssueDrafts': { request: void; response: IssueDraft[] }
  'debug:listPublishLog': { request: { repoId: string }; response: PublishLogEntry[] }
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
  | 'app-updates:status'
  | 'github:authProgress'

export type IpcAction = 'scratchpad:hide'

export type {
  AdvancedSettings,
  AgentEvent,
  AgentRunDetail,
  AgentRunListItem,
  AgentRunStatus,
  AgentRunStatusCounts,
  AutoPublishPublishReport,
  AutoPublishPreviewSummary,
  GenerateCurrentInboxDraftsRequest,
  GenerateCurrentInboxDraftsStartResponse,
  GenerateDraftsRequest,
  GenerateDraftsMode,
  GitHubIssueTemplate,
  IssueDraftStatus,
  OnboardingState,
  PiActiveConfig,
  PiModelOption,
  PiProviderOption,
  PiStatus,
  SearchProvider,
  SetAdvancedSettingsRequest
}
