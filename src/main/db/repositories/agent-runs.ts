import { desc, eq, inArray, sql } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { agentRuns, issueDrafts, notes } from '../schema'
import type {
  AgentRunDetail,
  AgentRunListItem,
  AgentRunStatus,
  ErrorCause,
  IssueDraft
} from '@shared/types'

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

export function getRunById(db: PilogDatabase, id: string): AgentRunDetail | null {
  const row = db.select(agentRunColumns).from(agentRuns).where(eq(agentRuns.id, id)).get()
  if (!row) return null

  const inputNoteIds = parseJsonArray<string>(row.inputNoteIds)
  const outputDraftIds = parseJsonArray<string>(row.outputDraftIds)
  const sourceNotes = loadNotesByIds(db, inputNoteIds)
  const outputDrafts = loadDraftsByIds(db, outputDraftIds)

  return {
    ...mapRunListItem(row),
    inputNoteIds,
    outputDraftIds,
    sourceNotes,
    outputDrafts,
    eventStream: parseJsonArray<unknown>(row.eventStream)
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined) return 100
  return Math.max(1, Math.min(Math.trunc(limit), 500))
}

function mapRunListItem(row: typeof agentRuns.$inferSelect): AgentRunListItem {
  const inputNoteIds = parseJsonArray<string>(row.inputNoteIds)
  const outputDraftIds = parseJsonArray<string>(row.outputDraftIds)
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
    errorCause: row.errorCause as ErrorCause | null
  }
}

function loadNotesByIds(db: PilogDatabase, ids: string[]): AgentRunDetail['sourceNotes'] {
  if (ids.length === 0) return []
  const rows = db.select(noteColumns).from(notes).where(inArray(notes.id, ids)).all()
  const byId = new Map(rows.map((row) => [row.id, row]))
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
    labels: parseJsonArray<string>(row.labels),
    sourceNoteIds: parseJsonArray<string>(row.sourceNoteIds),
    affectedFiles: parseJsonArray<{ path: string; reason: string }>(row.affectedFilesJson),
    confidence: row.confidence,
    groupingReason: row.groupingReason,
    status: row.status,
    githubIssueUrl: row.githubIssueUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function parseJsonArray<T>(value: string): T[] {
  const parsed = JSON.parse(value) as unknown
  return Array.isArray(parsed) ? (parsed as T[]) : []
}
