import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { Note, Repo } from '@shared/ipc'
import type { AutoPublishPreviewSummary, SearchProvider } from '@shared/types'
import type { RepoLabelLike } from '@shared/labels'
import { matchLabelsToRepoLabels } from '@shared/labels'
import {
  GeneratedIssueDraftsSchema,
  SubmitIssueDraftsParameters,
  type AgentEvent,
  type GeneratedIssueDraft
} from '@shared/types'
import { and, eq, inArray } from 'drizzle-orm'
import type { PilogDatabase } from '../db/client'
import { formatIssueDraftBody } from '../db/repositories/issue-drafts'
import { getRepoById } from '../db/repositories/repos'
import { agentRuns, issueDrafts, notes } from '../db/schema'

export type IssueGenerationInput = {
  runId: string
  repo: Repo
  notes: Note[]
  provider: string
  model: string
  turnBudget: number
  webSearch?: { provider: SearchProvider; apiKey: string }
  signal?: AbortSignal
}

export type RunAgent = (input: IssueGenerationInput) => AsyncIterable<AgentEvent>

export type AutoPublishPreviewPlan = {
  drafts: GeneratedIssueDraft[]
  summary: AutoPublishPreviewSummary
}

export function buildIssueGenerationPrompt(input: { repo: Repo; notes: Note[] }): string {
  const noteBlock = input.notes
    .map((note, index) => {
      return [
        `Note ${index + 1}`,
        `id: ${note.id}`,
        `status: ${note.status}`,
        'content:',
        note.content.trim() || '(empty note)'
      ].join('\n')
    })
    .join('\n\n---\n\n')

  return [
    'You are generating GitHub issue drafts from rough developer scratchpad notes.',
    'Use the local repository context to infer likely affected areas, but do not invent details.',
    'Group related small notes into one issue when they affect the same feature, page, component, or user flow.',
    'Split notes into separate issues when they affect unrelated systems or require separate implementation work.',
    'If one source note contains multiple unrelated tasks, split it into separate drafts and reference that same source note from each draft.',
    'Do not create one issue per note by default.',
    'Group related minor UX notes.',
    'Split unrelated or complex notes.',
    'For larger work, create a parent issue with checklist subtasks only when the scope clearly crosses multiple implementation areas.',
    'Inspect repository structure and search likely files/components/routes based on note language before drafting.',
    'Return 1-3 issue drafts.',
    'Each draft must have non-empty affectedFiles, acceptanceCriteria, and groupingReason when enough context exists.',
    'Prefer concrete acceptance criteria.',
    'Avoid overclaiming certainty.',
    'Use repo context when available.',
    'Include concise rationale, not hidden reasoning.',
    'Mark vague notes as needing clarification.',
    'Return structured JSON only by calling submit_issue_drafts with data matching the provided schema; do not emit prose outside the tool call.',
    '',
    'Repository:',
    `owner: ${input.repo.owner}`,
    `name: ${input.repo.name}`,
    `localPath: ${input.repo.localPath}`,
    `defaultBranch: ${input.repo.defaultBranch ?? '(unknown)'}`,
    '',
    'Selected notes:',
    noteBlock
  ].join('\n')
}

export function createSubmitIssueDraftsTool(
  onSubmit: (drafts: GeneratedIssueDraft[]) => void
): AgentTool<typeof SubmitIssueDraftsParameters> {
  let submitted = false

  return {
    name: 'submit_issue_drafts',
    label: 'Submit Issue Drafts',
    description: 'Submit validated generated GitHub issue drafts and terminate the run.',
    parameters: SubmitIssueDraftsParameters,
    executionMode: 'sequential',
    execute: async (_toolCallId, params) => {
      if (!submitted) {
        const drafts = GeneratedIssueDraftsSchema.parse(params.drafts)
        onSubmit(drafts)
        submitted = true
      }

      return {
        content: [{ type: 'text', text: 'Issue drafts submitted.' }],
        details: { submitted },
        terminate: true
      }
    }
  }
}

export function getSelectedNotesForGeneration(
  db: PilogDatabase,
  noteIds: string[]
): { repo: Repo; notes: Note[] } {
  if (noteIds.length === 0) throw new Error('Select at least one note.')

  const rows = db.select().from(notes).where(inArray(notes.id, noteIds)).all()
  if (rows.length !== noteIds.length) throw new Error('One or more selected notes no longer exist.')

  const repoIds = new Set(rows.map((note) => note.repoId))
  if (repoIds.size !== 1 || repoIds.has(null)) {
    throw new Error('Selected notes must share one linked repository.')
  }

  const repoId = rows[0]!.repoId!
  const repo = getRepoById(db, repoId)
  if (!repo) throw new Error('The linked repository no longer exists.')

  const order = new Map(noteIds.map((id, index) => [id, index]))
  const orderedNotes = rows
    .map(mapNoteRowForGeneration)
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)

  return { repo, notes: orderedNotes }
}

export function getCurrentInboxNotesForGeneration(
  db: PilogDatabase,
  repoId: string
): { repo: Repo; notes: Note[] } {
  const repo = getRepoById(db, repoId)
  if (!repo) throw new Error('The linked repository no longer exists.')

  const rows = db
    .select()
    .from(notes)
    .where(and(eq(notes.repoId, repoId), eq(notes.status, 'unprocessed')))
    .orderBy(notes.createdAt)
    .all()

  return {
    repo,
    notes: rows.map(mapNoteRowForGeneration)
  }
}

function mapNoteRowForGeneration(row: typeof notes.$inferSelect): Note {
  return {
    id: row.id,
    content: row.content,
    status: row.status,
    repoId: row.repoId,
    runId: row.runId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export function persistGeneratedIssueDrafts(
  db: PilogDatabase,
  input: {
    runId: string
    repoId: string
    selectedNoteIds: string[]
    drafts: GeneratedIssueDraft[]
    eventStream: unknown[]
  }
): string[] {
  return db.transaction((tx) => {
    const now = new Date().toISOString()
    const draftIds: string[] = []

    const sourceNoteIds = validateAndCollectSourceNoteIds(input.selectedNoteIds, input.drafts)

    for (const draft of input.drafts) {
      const id = crypto.randomUUID()
      draftIds.push(id)

      tx.insert(issueDrafts)
        .values({
          id,
          repoId: input.repoId,
          title: draft.title,
          body: formatIssueDraftBody(draft),
          labels: JSON.stringify(draft.suggestedLabels),
          sourceNoteIds: JSON.stringify(draft.sourceNoteIds),
          affectedFilesJson: JSON.stringify(draft.affectedFiles),
          confidence: draft.confidence,
          groupingReason: draft.groupingReason,
          status: 'draft',
          createdAt: now,
          updatedAt: now
        })
        .run()
    }

    tx.update(notes)
      .set({ status: 'drafted', runId: input.runId, updatedAt: now })
      .where(and(inArray(notes.id, sourceNoteIds), eq(notes.repoId, input.repoId)))
      .run()

    tx.update(agentRuns)
      .set({
        status: 'succeeded',
        outputDraftIds: JSON.stringify(draftIds),
        eventStream: JSON.stringify(input.eventStream),
        finishedAt: now,
        updatedAt: now
      })
      .where(eq(agentRuns.id, input.runId))
      .run()

    return draftIds
  })
}

export function planAutoPublishPreviewDrafts(input: {
  runId: string
  repo: Repo
  drafts: GeneratedIssueDraft[]
  repoLabels?: RepoLabelLike[]
}): AutoPublishPreviewPlan {
  if (!input.repo.autoPublishEnabled) {
    throw new Error('Auto-publish is not enabled for this repository.')
  }

  const maxIssuesPerRun = Math.max(1, Math.floor(input.repo.autoPublishMaxIssuesPerRun))
  const defaultLabel = input.repo.autoPublishDefaultLabel.trim()
  const plannedDrafts = input.drafts.slice(0, maxIssuesPerRun).map((draft) => {
    const suggestedLabels = applyDefaultLabel(draft.suggestedLabels, defaultLabel)
    const labelMatches = matchLabelsToRepoLabels(suggestedLabels, input.repoLabels ?? [])

    return {
      ...draft,
      suggestedLabels: labelMatches.map((match) => match.name),
      labelMatches
    }
  })
  const heldBackCount = Math.max(0, input.drafts.length - plannedDrafts.length)
  const limited = heldBackCount > 0

  return {
    drafts: plannedDrafts,
    summary: {
      runId: input.runId,
      repoId: input.repo.id,
      generatedDraftCount: input.drafts.length,
      plannedDraftCount: plannedDrafts.length,
      maxIssuesPerRun,
      defaultLabel,
      dryRun: input.repo.autoPublishDryRun,
      requireConfirmation: input.repo.autoPublishRequireConfirmation,
      limited,
      message: buildAutoPublishPreviewMessage({
        heldBackCount,
        maxIssuesPerRun,
        dryRun: input.repo.autoPublishDryRun
      })
    }
  }
}

function applyDefaultLabel(labels: string[], defaultLabel: string): string[] {
  if (!defaultLabel) return labels
  const seen = new Set(labels.map((label) => label.toLowerCase()))
  return seen.has(defaultLabel.toLowerCase()) ? labels : [...labels, defaultLabel]
}

function buildAutoPublishPreviewMessage(input: {
  heldBackCount: number
  maxIssuesPerRun: number
  dryRun: boolean
}): string {
  const dryRunPrefix = input.dryRun
    ? 'Dry run: Pilog planned these drafts and will not write to GitHub.'
    : 'Pilog planned these drafts for review before any GitHub writes.'

  if (input.heldBackCount === 0) return dryRunPrefix

  return `${dryRunPrefix} ${input.heldBackCount} ${
    input.heldBackCount === 1 ? 'draft is' : 'drafts are'
  } held back by the ${input.maxIssuesPerRun}-issue limit.`
}

export function validateAndCollectSourceNoteIds(
  selectedNoteIds: string[],
  drafts: GeneratedIssueDraft[]
): string[] {
  const selected = new Set(selectedNoteIds)
  const ordered = new Set<string>()

  for (const draft of drafts) {
    for (const noteId of draft.sourceNoteIds) {
      if (!selected.has(noteId)) {
        throw new Error(`Draft "${draft.title}" references an unselected source note: ${noteId}`)
      }
      ordered.add(noteId)
    }
  }

  return [...ordered]
}
