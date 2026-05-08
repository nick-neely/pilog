import { and, eq, inArray } from 'drizzle-orm'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { PilogDatabase } from '../db/client'
import { agentRuns, issueDrafts, notes, settings } from '../db/schema'
import { getRepoById } from '../db/repositories/repos'
import {
  GeneratedIssueDraftsSchema,
  SubmitIssueDraftsParameters,
  type AgentEvent,
  type GeneratedIssueDraft
} from '@shared/types'
import type { Note, Repo } from '@shared/ipc'

export type IssueGenerationInput = {
  runId: string
  repo: Repo
  notes: Note[]
  provider: string
  model: string
  turnBudget: number
  signal?: AbortSignal
}

export type RunAgent = (input: IssueGenerationInput) => AsyncIterable<AgentEvent>

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
    'For this tracer-bullet run, return exactly one issue draft.',
    'Prefer concrete acceptance criteria.',
    'Avoid overclaiming certainty.',
    'Include concise rationale, not hidden reasoning.',
    'Mark vague notes as needing clarification.',
    'Call submit_issue_drafts with structured JSON matching the provided schema.',
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

export function getTurnBudget(db: PilogDatabase): number {
  const row = db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, 'pi.turnBudget'))
    .get()
  const parsed = Number(row?.value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 20
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
    .map((row) => ({
      id: row.id,
      content: row.content,
      status: row.status,
      repoId: row.repoId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }))
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)

  return { repo, notes: orderedNotes }
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

    for (const draft of input.drafts.slice(0, 1)) {
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
      .set({ status: 'drafted', updatedAt: now })
      .where(and(inArray(notes.id, input.selectedNoteIds), eq(notes.repoId, input.repoId)))
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

function formatIssueDraftBody(draft: GeneratedIssueDraft): string {
  return [
    draft.summary,
    '',
    '## Context',
    draft.context,
    '',
    '## Acceptance Criteria',
    ...draft.acceptanceCriteria.map((item) => `- ${item}`),
    '',
    '## Implementation Notes',
    ...draft.implementationNotes.map((item) => `- ${item}`)
  ].join('\n')
}
