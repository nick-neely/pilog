import type {
  AgentRunDetail,
  AgentRunListItem,
  AgentRunStatus,
  AgentRunStatusCounts,
  ErrorCause,
  IssueDraft
} from '@shared/types'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { agentRuns, issueDrafts, notes } from '../schema'
import { mapNoteRow } from './notes'

const ERROR_CAUSES = [
  'auth_invalid',
  'rate_limited',
  'network',
  'provider_error',
  'unknown',
  'repo_missing',
  'pi_internal',
  'turn_budget_exceeded',
  'schema_validation',
  'persistence',
  'timeout',
  'cancelled'
] as const

const agentRunColumns = {
  id: agentRuns.id,
  repoId: agentRuns.repoId,
  inputNoteIds: agentRuns.inputNoteIds,
  outputDraftIds: agentRuns.outputDraftIds,
  status: agentRuns.status,
  errorMessage: agentRuns.errorMessage,
  errorCause: agentRuns.errorCause,
  eventStream: agentRuns.eventStream,
  startedAt: agentRuns.startedAt,
  finishedAt: agentRuns.finishedAt,
  createdAt: agentRuns.createdAt,
  updatedAt: agentRuns.updatedAt
} as const

const noteColumns = {
  id: notes.id,
  content: notes.content,
  status: notes.status,
  repoId: notes.repoId,
  runId: notes.runId,
  captureContext: notes.captureContext,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt
} as const

const issueDraftColumns = {
  id: issueDrafts.id,
  repoId: issueDrafts.repoId,
  title: issueDrafts.title,
  body: issueDrafts.body,
  labels: issueDrafts.labels,
  sourceNoteIds: issueDrafts.sourceNoteIds,
  affectedFilesJson: issueDrafts.affectedFilesJson,
  confidence: issueDrafts.confidence,
  groupingReason: issueDrafts.groupingReason,
  workflowState: issueDrafts.workflowState,
  clarificationQuestions: issueDrafts.clarificationQuestions,
  clarificationHistory: issueDrafts.clarificationHistory,
  status: issueDrafts.status,
  githubIssueUrl: issueDrafts.githubIssueUrl,
  createdAt: issueDrafts.createdAt,
  updatedAt: issueDrafts.updatedAt
} as const

export function createAgentRun(
  db: PilogDatabase,
  input: { repoId: string; inputNoteIds: string[] }
): { id: string; startedAt: string } {
  const now = new Date().toISOString()
  const id = uuidv4()

  db.insert(agentRuns)
    .values({
      id,
      repoId: input.repoId,
      inputNoteIds: JSON.stringify(input.inputNoteIds),
      outputDraftIds: JSON.stringify([]),
      status: 'running',
      eventStream: JSON.stringify([]),
      startedAt: now,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return { id, startedAt: now }
}

export function finalizeAgentRun(
  db: PilogDatabase,
  input: {
    id: string
    status: AgentRunStatus
    outputDraftIds?: string[]
    errorMessage?: string
    errorCause?: ErrorCause
    eventStream: unknown[]
  }
): void {
  const now = new Date().toISOString()

  db.update(agentRuns)
    .set({
      status: input.status,
      outputDraftIds: JSON.stringify(input.outputDraftIds ?? []),
      errorMessage: input.errorMessage,
      errorCause: input.errorCause,
      eventStream: JSON.stringify(input.eventStream),
      finishedAt: now,
      updatedAt: now
    })
    .where(eq(agentRuns.id, input.id))
    .run()
}

export function cancelRunningAgentRuns(db: PilogDatabase, message: string): void {
  const now = new Date().toISOString()

  db.update(agentRuns)
    .set({
      status: 'cancelled',
      errorMessage: message,
      errorCause: 'cancelled',
      finishedAt: now,
      updatedAt: now
    })
    .where(eq(agentRuns.status, 'running'))
    .run()
}

export function updateAgentRunEventStream(
  db: PilogDatabase,
  input: { id: string; eventStream: unknown[] }
): void {
  db.update(agentRuns)
    .set({
      eventStream: JSON.stringify(input.eventStream),
      updatedAt: new Date().toISOString()
    })
    .where(eq(agentRuns.id, input.id))
    .run()
}

export function listRuns(
  db: PilogDatabase,
  filter?: { status?: AgentRunStatus; limit?: number }
): AgentRunListItem[] {
  const limit = normalizeLimit(filter?.limit)
  const query = db.select(agentRunColumns).from(agentRuns)
  const filtered = filter?.status ? query.where(eq(agentRuns.status, filter.status)) : query

  return filtered
    .orderBy(desc(agentRuns.startedAt), desc(sql`rowid`))
    .limit(limit)
    .all()
    .map(mapRunListItem)
}

/**
 * Totals per status for the runs sidebar filter; every status is included
 * even when zero (matches inbox / drafts status filter contract).
 */
export function countRunsByStatus(db: PilogDatabase): AgentRunStatusCounts {
  const grouped = db
    .select({ status: agentRuns.status, count: sql<number>`count(*)` })
    .from(agentRuns)
    .groupBy(agentRuns.status)
    .all()

  const counts: AgentRunStatusCounts = {
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0
  }
  for (const row of grouped) {
    counts[row.status as AgentRunStatus] = Number(row.count)
  }
  return counts
}

export function getRunById(db: PilogDatabase, id: string): AgentRunDetail | null {
  const row = db.select(agentRunColumns).from(agentRuns).where(eq(agentRuns.id, id)).get()
  if (!row) return null

  const inputNoteIds = parseStringArray(row.inputNoteIds)
  const outputDraftIds = parseStringArray(row.outputDraftIds)
  const sourceNotes = loadNotesByIds(db, inputNoteIds)
  const outputDrafts = loadDraftsByIds(db, outputDraftIds)

  return {
    ...mapRunListItem(row),
    inputNoteIds,
    outputDraftIds,
    sourceNotes,
    outputDrafts,
    eventStream: parseJsonArray(row.eventStream)
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 100
  return Math.max(1, Math.min(Math.trunc(limit), 500))
}

function mapRunListItem(row: typeof agentRuns.$inferSelect): AgentRunListItem {
  const inputNoteIds = parseStringArray(row.inputNoteIds)
  const outputDraftIds = parseStringArray(row.outputDraftIds)
  return {
    id: row.id,
    repoId: row.repoId,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    durationMs: row.finishedAt ? Date.parse(row.finishedAt) - Date.parse(row.startedAt) : null,
    inputNoteCount: inputNoteIds.length,
    outputDraftCount: outputDraftIds.length,
    errorMessage: row.errorMessage,
    errorCause: parseErrorCause(row.errorCause)
  }
}

function loadNotesByIds(db: PilogDatabase, ids: string[]): AgentRunDetail['sourceNotes'] {
  if (ids.length === 0) return []
  const rows = db.select(noteColumns).from(notes).where(inArray(notes.id, ids)).all()
  const byId = new Map(rows.map((row) => [row.id, mapNoteRow(row)]))
  return ids.flatMap((id) => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

function loadDraftsByIds(db: PilogDatabase, ids: string[]): IssueDraft[] {
  if (ids.length === 0) return []
  const rows = db
    .select(issueDraftColumns)
    .from(issueDrafts)
    .where(inArray(issueDrafts.id, ids))
    .all()
  const byId = new Map(rows.map((row) => [row.id, mapIssueDraft(row)]))
  return ids.flatMap((id) => {
    const draft = byId.get(id)
    return draft ? [draft] : []
  })
}

function mapIssueDraft(row: typeof issueDrafts.$inferSelect): IssueDraft {
  return {
    id: row.id,
    repoId: row.repoId,
    title: row.title,
    body: row.body,
    labels: parseStringArray(row.labels),
    sourceNoteIds: parseStringArray(row.sourceNoteIds),
    affectedFiles: parseAffectedFiles(row.affectedFilesJson),
    confidence: row.confidence,
    groupingReason: row.groupingReason,
    workflowState: row.workflowState,
    clarificationQuestions: parseStringArray(row.clarificationQuestions),
    clarificationHistory: parseClarificationHistory(row.clarificationHistory),
    status: row.status,
    githubIssueUrl: row.githubIssueUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function parseJsonArray(value: string): unknown[] {
  const parsed = JSON.parse(value) as unknown
  return Array.isArray(parsed) ? parsed : []
}

function parseStringArray(value: string): string[] {
  return parseJsonArray(value).filter((item): item is string => typeof item === 'string')
}

function parseAffectedFiles(value: string): IssueDraft['affectedFiles'] {
  return parseJsonArray(value).filter((item): item is IssueDraft['affectedFiles'][number] => {
    return (
      item !== null &&
      typeof item === 'object' &&
      'path' in item &&
      'reason' in item &&
      typeof item.path === 'string' &&
      typeof item.reason === 'string'
    )
  })
}

function parseClarificationHistory(value: string): IssueDraft['clarificationHistory'] {
  return parseJsonArray(value).filter(
    (entry): entry is IssueDraft['clarificationHistory'][number] => {
      return (
        entry !== null &&
        typeof entry === 'object' &&
        'question' in entry &&
        'answer' in entry &&
        'answeredAt' in entry &&
        typeof entry.question === 'string' &&
        typeof entry.answer === 'string' &&
        typeof entry.answeredAt === 'string'
      )
    }
  )
}

function parseErrorCause(value: string | null): ErrorCause | null {
  if (!value) return null
  return isErrorCause(value) ? value : 'unknown'
}

function isErrorCause(value: string): value is ErrorCause {
  return ERROR_CAUSES.includes(value as ErrorCause)
}
