import { and, desc, eq, inArray } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { issueDrafts, notes } from '../schema'
import type {
  GeneratedIssueDraft,
  GitHubIssueTemplate,
  IssueDraft,
  IssueDraftForReview,
  IssueDraftWorkflowState,
  IssueDraftStatus
} from '@shared/types'
import {
  applyIssueTemplateToDraftBody,
  formatFallbackIssueDraftBody
} from '../../github/issue-templates'
import { mapNoteRow } from './notes'

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
  status: issueDrafts.status,
  githubIssueUrl: issueDrafts.githubIssueUrl,
  createdAt: issueDrafts.createdAt,
  updatedAt: issueDrafts.updatedAt
} as const

const sourceNoteColumns = {
  id: notes.id,
  content: notes.content,
  status: notes.status,
  repoId: notes.repoId,
  runId: notes.runId,
  captureContext: notes.captureContext,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt
} as const

export function createIssueDraft(
  db: PilogDatabase,
  input: { repoId: string; draft: GeneratedIssueDraft; template?: GitHubIssueTemplate | null }
): IssueDraft {
  const now = new Date().toISOString()
  const id = uuidv4()
  const body = formatIssueDraftBody(input.draft, input.template)
  const workflow = getGeneratedDraftWorkflow(input.draft)

  db.insert(issueDrafts)
    .values({
      id,
      repoId: input.repoId,
      title: input.draft.title,
      body,
      labels: JSON.stringify(input.draft.suggestedLabels),
      sourceNoteIds: JSON.stringify(input.draft.sourceNoteIds),
      affectedFilesJson: JSON.stringify(input.draft.affectedFiles),
      confidence: input.draft.confidence,
      groupingReason: input.draft.groupingReason,
      workflowState: workflow.state,
      clarificationQuestions: JSON.stringify(workflow.clarificationQuestions),
      status: 'draft',
      createdAt: now,
      updatedAt: now
    })
    .run()

  return {
    id,
    repoId: input.repoId,
    title: input.draft.title,
    body,
    labels: input.draft.suggestedLabels,
    sourceNoteIds: input.draft.sourceNoteIds,
    affectedFiles: input.draft.affectedFiles,
    confidence: input.draft.confidence,
    groupingReason: input.draft.groupingReason,
    workflowState: workflow.state,
    clarificationQuestions: workflow.clarificationQuestions,
    status: 'draft',
    githubIssueUrl: null,
    createdAt: now,
    updatedAt: now
  }
}

export function listIssueDrafts(
  db: PilogDatabase,
  filter: {
    status?: IssueDraftStatus | 'all'
    workflowState?: IssueDraftWorkflowState | 'all'
  } = {}
): IssueDraft[] {
  const status = filter.status ?? 'draft'
  const query = db.select(issueDraftColumns).from(issueDrafts)
  const predicates = [
    status === 'all' ? undefined : eq(issueDrafts.status, status),
    filter.workflowState && filter.workflowState !== 'all'
      ? eq(issueDrafts.workflowState, filter.workflowState)
      : undefined
  ].filter((predicate): predicate is NonNullable<typeof predicate> => predicate !== undefined)
  const filtered = predicates.length === 0 ? query : query.where(and(...predicates))

  return filtered.orderBy(desc(issueDrafts.createdAt)).all().map(mapIssueDraft)
}

export function listIssueDraftsForReview(
  db: PilogDatabase,
  filter: {
    status?: IssueDraftStatus | 'all'
    workflowState?: IssueDraftWorkflowState | 'all'
  } = {}
): IssueDraftForReview[] {
  const drafts = listIssueDrafts(db, filter)
  const sourceNoteIds = [...new Set(drafts.flatMap((draft) => draft.sourceNoteIds))]

  if (sourceNoteIds.length === 0) {
    return drafts.map((draft) => ({ ...draft, sourceNotes: [] }))
  }

  const sourceNotes = db
    .select(sourceNoteColumns)
    .from(notes)
    .where(inArray(notes.id, sourceNoteIds))
    .all()
  const sourceNotesById = new Map(sourceNotes.map((note) => [note.id, mapNoteRow(note)]))

  return drafts.map((draft) => ({
    ...draft,
    sourceNotes: draft.sourceNoteIds
      .map((id) => sourceNotesById.get(id))
      .filter((note): note is NonNullable<typeof note> => note !== undefined)
  }))
}

export function getIssueDraftById(db: PilogDatabase, id: string): IssueDraft | null {
  const row = db.select(issueDraftColumns).from(issueDrafts).where(eq(issueDrafts.id, id)).get()
  return row ? mapIssueDraft(row) : null
}

export function updateIssueDraft(
  db: PilogDatabase,
  input: { id: string; title: string; body: string; labels: string[] }
): IssueDraft | null {
  const previousUpdatedAt = getIssueDraftUpdatedAt(db, input.id)
  if (!previousUpdatedAt) return null

  const now = nextUpdatedAt(previousUpdatedAt)

  db.update(issueDrafts)
    .set({
      title: input.title,
      body: input.body,
      labels: JSON.stringify(input.labels),
      updatedAt: now
    })
    .where(eq(issueDrafts.id, input.id))
    .run()

  return getIssueDraftById(db, input.id)
}

export function updateIssueDraftStatus(
  db: PilogDatabase,
  input: { id: string; status: IssueDraftStatus }
): IssueDraft | null {
  const previousUpdatedAt = getIssueDraftUpdatedAt(db, input.id)
  if (!previousUpdatedAt) return null

  const now = nextUpdatedAt(previousUpdatedAt)

  db.update(issueDrafts)
    .set({
      status: input.status,
      updatedAt: now
    })
    .where(eq(issueDrafts.id, input.id))
    .run()

  return getIssueDraftById(db, input.id)
}

export function splitIssueDraft(
  db: PilogDatabase,
  input: { id: string; movedSourceNoteIds: string[] }
): { original: IssueDraft; newDraft: IssueDraft } {
  const newDraftId = uuidv4()

  db.transaction((tx) => {
    const row = tx
      .select(issueDraftColumns)
      .from(issueDrafts)
      .where(eq(issueDrafts.id, input.id))
      .get()
    if (!row) throw new Error('Draft not found')

    const draft = mapIssueDraft(row)
    if (draft.status !== 'draft') throw new Error('Only active drafts can be split')

    const movedSourceNoteIds = uniqueInOriginalOrder(draft.sourceNoteIds, input.movedSourceNoteIds)
    if (movedSourceNoteIds.length === 0) {
      throw new Error('Choose at least one source note to split')
    }

    const invalidSourceNoteIds = input.movedSourceNoteIds.filter(
      (id) => !draft.sourceNoteIds.includes(id)
    )
    if (invalidSourceNoteIds.length > 0) {
      throw new Error('Split source notes must belong to the selected draft')
    }

    const moved = new Set(movedSourceNoteIds)
    const remainingSourceNoteIds = draft.sourceNoteIds.filter((id) => !moved.has(id))
    if (remainingSourceNoteIds.length === 0) {
      throw new Error('Split must leave at least one source note on each draft')
    }

    const now = nextUpdatedAt(draft.updatedAt)
    const groupingReason = draft.groupingReason
      ? `Split from draft: ${draft.groupingReason}`
      : 'Split from draft.'

    tx.update(issueDrafts)
      .set({
        sourceNoteIds: JSON.stringify(remainingSourceNoteIds),
        updatedAt: now
      })
      .where(eq(issueDrafts.id, draft.id))
      .run()

    tx.insert(issueDrafts)
      .values({
        id: newDraftId,
        repoId: draft.repoId,
        title: `${draft.title} (split)`,
        body: draft.body,
        labels: JSON.stringify(draft.labels),
        sourceNoteIds: JSON.stringify(movedSourceNoteIds),
        affectedFilesJson: JSON.stringify(draft.affectedFiles),
        confidence: draft.confidence,
        groupingReason,
        workflowState: draft.workflowState,
        clarificationQuestions: JSON.stringify(draft.clarificationQuestions),
        status: 'draft',
        githubIssueUrl: null,
        createdAt: now,
        updatedAt: now
      })
      .run()
  })

  const original = getIssueDraftById(db, input.id)
  const newDraft = getIssueDraftById(db, newDraftId)
  if (!original || !newDraft) throw new Error('Split draft could not be loaded')

  return { original, newDraft }
}

function uniqueInOriginalOrder(originalIds: string[], selectedIds: string[]): string[] {
  const selected = new Set(selectedIds)
  return originalIds.filter((id) => selected.has(id))
}

export function mergeIssueDrafts(
  db: PilogDatabase,
  input: { targetId: string; sourceId: string }
): IssueDraft | null {
  if (input.targetId === input.sourceId) throw new Error('Choose two different drafts to merge.')

  return db.transaction((tx) => {
    const rows = tx
      .select(issueDraftColumns)
      .from(issueDrafts)
      .where(inArray(issueDrafts.id, [input.targetId, input.sourceId]))
      .all()
    const draftsById = new Map(rows.map((row) => [row.id, mapIssueDraft(row)]))
    const target = draftsById.get(input.targetId)
    const source = draftsById.get(input.sourceId)

    if (!target || !source) return null
    if (target.repoId !== source.repoId) {
      throw new Error('Drafts from different repositories cannot be merged.')
    }
    if (target.status !== 'draft' || source.status !== 'draft') {
      throw new Error('Only active drafts can be merged.')
    }

    const latestUpdatedAt = [target.updatedAt, source.updatedAt].sort().at(-1) ?? target.updatedAt
    const now = nextUpdatedAt(latestUpdatedAt)

    tx.update(issueDrafts)
      .set({
        body: mergeDraftBodies(target, source),
        labels: JSON.stringify(mergeUnique(target.labels, source.labels)),
        sourceNoteIds: JSON.stringify(mergeUnique(target.sourceNoteIds, source.sourceNoteIds)),
        affectedFilesJson: JSON.stringify(
          mergeAffectedFiles(target.affectedFiles, source.affectedFiles)
        ),
        workflowState: mergeWorkflowState(target, source),
        clarificationQuestions: JSON.stringify(
          mergeUnique(target.clarificationQuestions, source.clarificationQuestions)
        ),
        status: 'draft',
        updatedAt: now
      })
      .where(eq(issueDrafts.id, target.id))
      .run()

    tx.update(issueDrafts)
      .set({
        status: 'dismissed',
        updatedAt: now
      })
      .where(eq(issueDrafts.id, source.id))
      .run()

    const merged = tx
      .select(issueDraftColumns)
      .from(issueDrafts)
      .where(eq(issueDrafts.id, target.id))
      .get()

    return merged ? mapIssueDraft(merged) : null
  })
}

function getIssueDraftUpdatedAt(db: PilogDatabase, id: string): string | null {
  const row = db
    .select({ updatedAt: issueDrafts.updatedAt })
    .from(issueDrafts)
    .where(eq(issueDrafts.id, id))
    .get()

  return row?.updatedAt ?? null
}

export function markIssueDraftPublished(
  db: PilogDatabase,
  input: {
    id: string
    title: string
    body: string
    labels: string[]
    githubIssueUrl: string
  }
): IssueDraft | null {
  const previousUpdatedAt = getIssueDraftUpdatedAt(db, input.id)
  if (!previousUpdatedAt) return null

  const now = nextUpdatedAt(previousUpdatedAt)

  db.update(issueDrafts)
    .set({
      title: input.title,
      body: input.body,
      labels: JSON.stringify(input.labels),
      status: 'published',
      githubIssueUrl: input.githubIssueUrl,
      updatedAt: now
    })
    .where(eq(issueDrafts.id, input.id))
    .run()

  return getIssueDraftById(db, input.id)
}

function nextUpdatedAt(previousUpdatedAt: string): string {
  const now = new Date()
  const previous = new Date(previousUpdatedAt)
  if (now <= previous) now.setTime(previous.getTime() + 1)

  return now.toISOString()
}

function mapIssueDraft(row: typeof issueDrafts.$inferSelect): IssueDraft {
  return {
    id: row.id,
    repoId: row.repoId,
    title: row.title,
    body: row.body,
    labels: JSON.parse(row.labels),
    sourceNoteIds: JSON.parse(row.sourceNoteIds),
    affectedFiles: JSON.parse(row.affectedFilesJson),
    confidence: row.confidence,
    groupingReason: row.groupingReason,
    workflowState: row.workflowState,
    clarificationQuestions: JSON.parse(row.clarificationQuestions),
    status: row.status,
    githubIssueUrl: row.githubIssueUrl,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function getGeneratedDraftWorkflow(draft: GeneratedIssueDraft): {
  state: IssueDraftWorkflowState
  clarificationQuestions: string[]
} {
  const clarificationQuestions = getGeneratedDraftClarificationQuestions(draft)
  const state =
    !draft.publishReady && clarificationQuestions.length > 0 ? 'needs_clarification' : 'ready'

  return { state, clarificationQuestions }
}

export function getGeneratedDraftClarificationQuestions(draft: GeneratedIssueDraft): string[] {
  return (draft.needsClarification ?? []).map((question) => question.trim()).filter(Boolean)
}

function mergeWorkflowState(target: IssueDraft, source: IssueDraft): IssueDraftWorkflowState {
  return target.workflowState === 'needs_clarification' ||
    source.workflowState === 'needs_clarification'
    ? 'needs_clarification'
    : 'ready'
}

function mergeDraftBodies(target: IssueDraft, source: IssueDraft): string {
  return [target.body.trim(), `## Merged draft: ${source.title}`, source.body.trim()]
    .filter(Boolean)
    .join('\n\n')
}

function mergeUnique<T>(targetItems: T[], sourceItems: T[]): T[] {
  return [...new Set([...targetItems, ...sourceItems])]
}

function mergeAffectedFiles(
  targetFiles: IssueDraft['affectedFiles'],
  sourceFiles: IssueDraft['affectedFiles']
): IssueDraft['affectedFiles'] {
  const filesByPath = new Map<string, IssueDraft['affectedFiles'][number]>()

  for (const file of [...targetFiles, ...sourceFiles]) {
    const existing = filesByPath.get(file.path)
    if (!existing) {
      filesByPath.set(file.path, file)
      continue
    }

    if (file.reason && !existing.reason.includes(file.reason)) {
      filesByPath.set(file.path, {
        ...existing,
        reason: `${existing.reason}; ${file.reason}`
      })
    }
  }

  return [...filesByPath.values()]
}

export function formatIssueDraftBody(
  draft: GeneratedIssueDraft,
  template?: GitHubIssueTemplate | null
): string {
  return template
    ? applyIssueTemplateToDraftBody(draft, template)
    : formatFallbackIssueDraftBody(draft)
}
