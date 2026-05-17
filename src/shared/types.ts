import { Type, type Static } from 'typebox'
import { z } from 'zod'

export const ConfidenceSchema = z.enum(['low', 'medium', 'high'])
export const PrioritySchema = z.enum(['low', 'medium', 'high'])

export const GeneratedIssueDraftSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  context: z.string().min(1),
  sourceNoteIds: z.array(z.string()).min(1),
  suggestedLabels: z.array(z.string()),
  priority: PrioritySchema.optional(),
  affectedFiles: z
    .array(
      z.object({
        path: z.string().min(1),
        reason: z.string().min(1)
      })
    )
    .min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  implementationNotes: z.array(z.string()),
  confidence: ConfidenceSchema,
  groupingReason: z.string().min(1),
  publishReady: z.boolean(),
  needsClarification: z.array(z.string().min(1)).optional(),
  labelMatches: z
    .array(
      z.discriminatedUnion('matched', [
        z.object({
          input: z.string(),
          name: z.string(),
          matched: z.literal(true)
        }),
        z.object({
          input: z.string(),
          name: z.string(),
          matched: z.literal(false)
        })
      ])
    )
    .optional()
})

export const GeneratedIssueDraftsSchema = z.array(GeneratedIssueDraftSchema)

export type GeneratedIssueDraft = z.infer<typeof GeneratedIssueDraftSchema>

export const GeneratedIssueDraftTypeBox = Type.Object({
  title: Type.String({ minLength: 1 }),
  summary: Type.String({ minLength: 1 }),
  context: Type.String({ minLength: 1 }),
  sourceNoteIds: Type.Array(Type.String(), { minItems: 1 }),
  suggestedLabels: Type.Array(Type.String()),
  priority: Type.Optional(
    Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')])
  ),
  affectedFiles: Type.Array(
    Type.Object({
      path: Type.String({ minLength: 1 }),
      reason: Type.String({ minLength: 1 })
    }),
    { minItems: 1 }
  ),
  acceptanceCriteria: Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
  implementationNotes: Type.Array(Type.String()),
  confidence: Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')]),
  groupingReason: Type.String({ minLength: 1 }),
  publishReady: Type.Boolean(),
  needsClarification: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
  labelMatches: Type.Optional(
    Type.Array(
      Type.Union([
        Type.Object({
          input: Type.String(),
          name: Type.String(),
          matched: Type.Literal(true)
        }),
        Type.Object({
          input: Type.String(),
          name: Type.String(),
          matched: Type.Literal(false)
        })
      ])
    )
  )
})

export const SubmitIssueDraftsParameters = Type.Object({
  drafts: Type.Array(GeneratedIssueDraftTypeBox, { minItems: 1, maxItems: 3 })
})

export type SubmitIssueDraftsParameters = Static<typeof SubmitIssueDraftsParameters>

export type ErrorCause =
  | 'auth_invalid'
  | 'rate_limited'
  | 'network'
  | 'provider_error'
  | 'unknown'
  | 'repo_missing'
  | 'pi_internal'
  | 'turn_budget_exceeded'
  | 'schema_validation'
  | 'persistence'
  | 'timeout'
  | 'cancelled'

export type NoteCaptureContext =
  | {
      state: 'captured'
      branch: string | null
      dirtyFiles: string[]
      stagedFiles: string[]
      headSha: string | null
      headSubject: string | null
      diffSummary?: GitDiffSummary
      capturedAt: string
    }
  | {
      state: 'unavailable'
      capturedAt: string
    }

export type GitDiffSummary = {
  filesChanged: number
  insertions: number
  deletions: number
}

export type AgentEvent =
  | { type: 'progress'; phase: string }
  | { type: 'partial'; text: string }
  | {
      type: 'final'
      drafts: GeneratedIssueDraft[]
      autoPublishPreview?: AutoPublishPreviewSummary
    }
  | { type: 'error'; message: string; cause: ErrorCause }

export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

/** Sidebar filter totals; every status appears even when zero. */
export type AgentRunStatusCounts = Record<AgentRunStatus, number>

export type AgentRunListItem = {
  id: string
  repoId: string | null
  status: AgentRunStatus
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  inputNoteCount: number
  outputDraftCount: number
  errorMessage: string | null
  errorCause: ErrorCause | null
}

export type AgentRunDetail = AgentRunListItem & {
  inputNoteIds: string[]
  outputDraftIds: string[]
  sourceNotes: Array<{
    id: string
    content: string
    status: 'unprocessed' | 'drafted' | 'published' | 'dismissed'
    repoId: string | null
    runId: string | null
    captureContext: NoteCaptureContext | null
    createdAt: string
    updatedAt: string
  }>
  outputDrafts: IssueDraft[]
  eventStream: unknown[]
}

export type GenerateDraftsMode = 'review' | 'auto-publish-preview'

export type AutoPublishSkippedDraft = {
  title: string
  reason: string
  sourceNoteIds: string[]
  labels: string[]
}

export type AutoPublishPreviewSummary = {
  runId: string
  repoId: string
  generatedDraftCount: number
  plannedDraftCount: number
  skippedDrafts: AutoPublishSkippedDraft[]
  maxIssuesPerRun: number
  defaultLabel: string
  dryRun: boolean
  requireConfirmation: boolean
  limited: boolean
  message: string
}

export type AutoPublishPublishReportItem = {
  draftId: string
  title: string
  sourceNoteIds: string[]
  labels: string[]
}

export type AutoPublishPublishSuccess = AutoPublishPublishReportItem & {
  githubIssueUrl: string
}

export type AutoPublishPublishFailure = AutoPublishPublishReportItem & {
  error: string
}

export type AutoPublishPublishReport = {
  runId: string
  repoId: string
  repo: {
    id: string
    owner: string
    name: string
  }
  publishedAt: string
  successCount: number
  failureCount: number
  skippedCount: number
  successes: AutoPublishPublishSuccess[]
  failures: AutoPublishPublishFailure[]
  skippedDrafts: AutoPublishSkippedDraft[]
}

export type GenerateDraftsRequest = {
  noteIds: string[]
  mode?: GenerateDraftsMode
  draftSettingsOverride?: GenerateDraftSettingsOverride
  clarificationDraftId?: string
}

export type GenerateCurrentInboxDraftsRequest = {
  repoId: string
  mode?: GenerateDraftsMode
  draftSettingsOverride?: GenerateDraftSettingsOverride
}

export type GenerateDraftSettingsOverride = {
  issueStyleDepth?: 'concise' | 'balanced' | 'detailed'
  issueStyleAudience?: 'internal' | 'open_source'
  draftContentToggles?: {
    includeImplementationNotes?: boolean
    includeAffectedFiles?: boolean
    includeSourceNotes?: boolean
    includeAcceptanceCriteria?: boolean
    includeConfidenceRationale?: boolean
    includeReproductionSteps?: boolean
  }
}

export type GenerateDraftsStartResponse = {
  runId: string
}

export type GenerateCurrentInboxDraftsStartResponse =
  | GenerateDraftsStartResponse
  | {
      skipped: true
      repoId: string
      eligibleNoteCount: 0
      reason: string
    }

export const DEFAULT_TURN_BUDGET = 20
export const MIN_TURN_BUDGET = 1
export const MAX_TURN_BUDGET = 100

export const SEARCH_PROVIDERS = ['brave', 'tavily'] as const
export type SearchProvider = (typeof SEARCH_PROVIDERS)[number]

export function isSearchProvider(value: unknown): value is SearchProvider {
  return typeof value === 'string' && SEARCH_PROVIDERS.some((provider) => provider === value)
}

export type AdvancedSettings = {
  turnBudget: number
  webSearchEnabled: boolean
  webSearchProvider: SearchProvider
  webSearchHasApiKey: boolean
}

export type SetAdvancedSettingsRequest = {
  turnBudget?: number
  webSearchEnabled?: boolean
  webSearchProvider?: SearchProvider
  webSearchApiKey?: string
}

export type PiStatus = {
  configured: boolean
  reason?: 'missing-provider' | 'missing-model' | 'missing-credential'
}

export type PiAuthMethod = 'api_key' | 'oauth'

export type PiActiveConfig = {
  provider: string | null
  providerName: string | null
  modelId: string | null
  modelName: string | null
  hasApiKey: boolean
  authMethod: PiAuthMethod | null
  valid: boolean
  reason?: PiStatus['reason'] | 'unknown-provider' | 'unknown-model'
}

export type PiProviderOption = {
  id: string
  name: string
  modelCount: number
  hasCredential: boolean
  authMethod: PiAuthMethod | null
}

export type PiModelOption = {
  id: string
  name: string
  provider: string
}

export type IssueDraftStatus = 'draft' | 'published' | 'dismissed'
export type IssueDraftWorkflowState = 'ready' | 'needs_clarification'

export type ClarificationHistoryEntry = {
  question: string
  answer: string
  answeredAt: string
}

export type IssueDraft = {
  id: string
  repoId: string
  title: string
  body: string
  labels: string[]
  sourceNoteIds: string[]
  affectedFiles: Array<{ path: string; reason: string }>
  confidence: 'low' | 'medium' | 'high'
  groupingReason: string
  workflowState: IssueDraftWorkflowState
  clarificationQuestions: string[]
  clarificationHistory: ClarificationHistoryEntry[]
  status: IssueDraftStatus
  githubIssueUrl: string | null
  createdAt: string
  updatedAt: string
}

export type IssueDraftSourceNote = {
  id: string
  content: string
  status: 'unprocessed' | 'drafted' | 'published' | 'dismissed'
  repoId: string | null
  runId: string | null
  captureContext: NoteCaptureContext | null
  createdAt: string
  updatedAt: string
}

export type IssueDraftForReview = IssueDraft & {
  sourceNotes: IssueDraftSourceNote[]
}

export type GitHubIssueTemplate = {
  kind: 'markdown' | 'yaml-form'
  name: string
  path: string
  title: string
  body: string
}

export type { OnboardingState, OnboardingStepId, OnboardingSignals } from './onboarding'
