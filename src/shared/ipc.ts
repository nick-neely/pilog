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
  accessKind: RepoAccessKind
  wslDistro: string | null
  wslPath: string | null
  githubUrl: string | null
  defaultBranch: string | null
  githubLabels: GitHubLabel[]
  githubLabelsSyncedAt: string | null
  autoPublishEnabled: boolean
  autoPublishMaxIssuesPerRun: number
  autoPublishDefaultLabel: string
  autoPublishDryRun: boolean
  autoPublishRequireConfirmation: boolean
  issueStyleDepth: IssueStyleDepth
  issueStyleAudience: IssueStyleAudience
  draftContentToggles: DraftContentToggles
  repoIndex?: RepoIndexStatus | null
  createdAt: string
  updatedAt: string
}

export type RepoIndexStatus =
  | {
      status: 'ready'
      lastIndexedAt: string
      indexVersion: number
      packageManager: string | null
      frameworkSignals: string[]
      importantDirectories: RepoIndexDirectory[]
      exclusionSummary: RepoIndexExclusionSummary
      errorMessage: null
    }
  | {
      status: 'failed'
      lastIndexedAt: string | null
      indexVersion: number
      packageManager: string | null
      frameworkSignals: string[]
      importantDirectories: RepoIndexDirectory[]
      exclusionSummary: RepoIndexExclusionSummary
      errorMessage: string
    }

export type RepoIndexDirectory = {
  path: string
  role: string
}

export type RepoIndexExclusionSummary = {
  dependency: number
  buildOutput: number
  generated: number
  binaryHeavy: number
  ignored: number
}

export type RepoAccessKind = 'host' | 'wsl'

export type RepoAccessDescriptor =
  | { kind: 'host'; displayPath: string }
  | { kind: 'wsl'; displayPath: string; distro: string; linuxPath: string }

export type WslRepoDetectionFailureReason =
  | 'wsl-unavailable'
  | 'distro-unavailable'
  | 'git-missing'
  | 'path-missing'
  | 'not-git'
  | 'no-origin'
  | 'unmatched'

export type RepoAutoPublishSettings = Pick<
  Repo,
  | 'autoPublishEnabled'
  | 'autoPublishMaxIssuesPerRun'
  | 'autoPublishDefaultLabel'
  | 'autoPublishDryRun'
  | 'autoPublishRequireConfirmation'
>

export type IssueStyleDepth = 'concise' | 'balanced' | 'detailed'
export type IssueStyleAudience = 'internal' | 'open_source'

export type DraftContentToggles = {
  includeImplementationNotes: boolean
  includeAffectedFiles: boolean
  includeSourceNotes: boolean
  includeAcceptanceCriteria: boolean
  includeConfidenceRationale: boolean
  includeReproductionSteps: boolean
}

export type RepoDraftSettings = Pick<
  Repo,
  'issueStyleDepth' | 'issueStyleAudience' | 'draftContentToggles'
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

export const DEFAULT_REPO_DRAFT_SETTINGS = {
  issueStyleDepth: 'balanced',
  issueStyleAudience: 'internal',
  draftContentToggles: {
    includeImplementationNotes: true,
    includeAffectedFiles: true,
    includeSourceNotes: true,
    includeAcceptanceCriteria: true,
    includeConfidenceRationale: true,
    includeReproductionSteps: true
  }
} as const satisfies RepoDraftSettings

const ISSUE_STYLE_DEPTHS = ['concise', 'balanced', 'detailed'] as const
const ISSUE_STYLE_AUDIENCES = ['internal', 'open_source'] as const

type UnknownRepoDraftSettings = {
  issueStyleDepth?: unknown
  issueStyleAudience?: unknown
  draftContentToggles?: Partial<Record<keyof DraftContentToggles, unknown>> | null
}

export function normalizeRepoDraftSettings(input: UnknownRepoDraftSettings): RepoDraftSettings {
  const defaultToggles = DEFAULT_REPO_DRAFT_SETTINGS.draftContentToggles
  const inputToggles = input.draftContentToggles ?? {}

  return {
    issueStyleDepth: ISSUE_STYLE_DEPTHS.includes(input.issueStyleDepth as IssueStyleDepth)
      ? (input.issueStyleDepth as IssueStyleDepth)
      : DEFAULT_REPO_DRAFT_SETTINGS.issueStyleDepth,
    issueStyleAudience: ISSUE_STYLE_AUDIENCES.includes(
      input.issueStyleAudience as IssueStyleAudience
    )
      ? (input.issueStyleAudience as IssueStyleAudience)
      : DEFAULT_REPO_DRAFT_SETTINGS.issueStyleAudience,
    draftContentToggles: {
      includeImplementationNotes:
        typeof inputToggles.includeImplementationNotes === 'boolean'
          ? inputToggles.includeImplementationNotes
          : defaultToggles.includeImplementationNotes,
      includeAffectedFiles:
        typeof inputToggles.includeAffectedFiles === 'boolean'
          ? inputToggles.includeAffectedFiles
          : defaultToggles.includeAffectedFiles,
      includeSourceNotes:
        typeof inputToggles.includeSourceNotes === 'boolean'
          ? inputToggles.includeSourceNotes
          : defaultToggles.includeSourceNotes,
      includeAcceptanceCriteria:
        typeof inputToggles.includeAcceptanceCriteria === 'boolean'
          ? inputToggles.includeAcceptanceCriteria
          : defaultToggles.includeAcceptanceCriteria,
      includeConfidenceRationale:
        typeof inputToggles.includeConfidenceRationale === 'boolean'
          ? inputToggles.includeConfidenceRationale
          : defaultToggles.includeConfidenceRationale,
      includeReproductionSteps:
        typeof inputToggles.includeReproductionSteps === 'boolean'
          ? inputToggles.includeReproductionSteps
          : defaultToggles.includeReproductionSteps
    }
  }
}

export type UpdateRepoDraftSettingsRequest = {
  id: string
} & RepoDraftSettings

export type DetectLocalRepoResult =
  | { state: 'runtime-blocked'; message: string; recoveryAction: string }
  | { state: 'unauthenticated' }
  | { state: 'not-git' }
  | { state: 'no-remote' }
  | { state: 'unmatched'; remoteUrl: string }
  | {
      state: 'wsl-failure'
      reason: WslRepoDetectionFailureReason
      access: Extract<RepoAccessDescriptor, { kind: 'wsl' }>
      remoteUrl?: string
    }
  | {
      state: 'matched'
      remoteUrl: string
      defaultBranch: string
      headSha: string
      githubRepo: GitHubRepo
      access: RepoAccessDescriptor
    }

export type LinkRepoRequest = {
  localPath: string
  access?: RepoAccessDescriptor
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

export type RuntimeReadinessStatus = 'ready' | 'degraded' | 'missing'

export type RuntimeReadinessItem = {
  status: RuntimeReadinessStatus
  label: string
  detail: string
  recoveryAction: string
}

export type RuntimeReadiness = {
  ready: boolean
  checkedAt: string
  items: {
    git: RuntimeReadinessItem & { version: string | null }
    keychain: RuntimeReadinessItem
    localRepositories: RuntimeReadinessItem & {
      checkedCount: number
      inaccessiblePaths: string[]
    }
    bundledRepoTooling: RuntimeReadinessItem
  }
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
  repoAccess?: RepoAccessDescriptor | null
}

export type PathActionResult =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'unavailable' | 'copied-fallback'; fallbackPath?: string }

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
  'repos:refreshIndex': { request: { id: string }; response: Repo | null }
  'repos:updateAutoPublishSettings': {
    request: UpdateRepoAutoPublishSettingsRequest
    response: Repo | null
  }
  'repos:updateDraftSettings': {
    request: UpdateRepoDraftSettingsRequest
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
  'runtime:readiness': { request: void; response: RuntimeReadiness }
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
