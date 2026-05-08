import { Type, type Static } from 'typebox'
import { z } from 'zod'

export const ConfidenceSchema = z.enum(['low', 'medium', 'high'])
export const PrioritySchema = z.enum(['low', 'medium', 'high'])

export const GeneratedIssueDraftSchema = z.object({
  title: z.string(),
  summary: z.string(),
  context: z.string(),
  sourceNoteIds: z.array(z.string()),
  suggestedLabels: z.array(z.string()),
  priority: PrioritySchema.optional(),
  affectedFiles: z.array(
    z.object({
      path: z.string(),
      reason: z.string()
    })
  ),
  acceptanceCriteria: z.array(z.string()),
  implementationNotes: z.array(z.string()),
  confidence: ConfidenceSchema,
  groupingReason: z.string(),
  publishReady: z.boolean(),
  needsClarification: z.array(z.string()).optional()
})

export const GeneratedIssueDraftsSchema = z.array(GeneratedIssueDraftSchema)

export type GeneratedIssueDraft = z.infer<typeof GeneratedIssueDraftSchema>

export const GeneratedIssueDraftTypeBox = Type.Object({
  title: Type.String(),
  summary: Type.String(),
  context: Type.String(),
  sourceNoteIds: Type.Array(Type.String()),
  suggestedLabels: Type.Array(Type.String()),
  priority: Type.Optional(
    Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')])
  ),
  affectedFiles: Type.Array(
    Type.Object({
      path: Type.String(),
      reason: Type.String()
    })
  ),
  acceptanceCriteria: Type.Array(Type.String()),
  implementationNotes: Type.Array(Type.String()),
  confidence: Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')]),
  groupingReason: Type.String(),
  publishReady: Type.Boolean(),
  needsClarification: Type.Optional(Type.Array(Type.String()))
})

export const SubmitIssueDraftsParameters = Type.Object({
  drafts: Type.Array(GeneratedIssueDraftTypeBox, { minItems: 1, maxItems: 1 })
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

export type GenerateDraftsRequest = {
  noteIds: string[]
}

export type GenerateDraftsStartResponse = {
  runId: string
}

export type PiStatus = {
  configured: boolean
  reason?: 'missing-provider' | 'missing-model' | 'missing-credential'
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
