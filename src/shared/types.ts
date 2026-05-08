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
  needsClarification: z.array(z.string().min(1)).optional()
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
  needsClarification: Type.Optional(Type.Array(Type.String({ minLength: 1 })))
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
  | 'cancelled'

export type AgentEvent =
  | { type: 'progress'; phase: string }
  | { type: 'partial'; text: string }
  | { type: 'final'; drafts: GeneratedIssueDraft[] }
  | { type: 'error'; message: string; cause: ErrorCause }

export type AgentRunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'

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
    createdAt: string
    updatedAt: string
  }>
  outputDrafts: IssueDraft[]
  eventStream: unknown[]
}

export type GenerateDraftsRequest = {
  noteIds: string[]
}

export type GenerateDraftsStartResponse = {
  runId: string
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
  status: 'draft' | 'published' | 'dismissed'
  githubIssueUrl: string | null
  createdAt: string
  updatedAt: string
}
