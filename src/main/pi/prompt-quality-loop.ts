import type { AgentTool } from '@earendil-works/pi-agent-core'
import { matchLabelsToRepoLabels } from '@shared/labels'
import type { Note } from '@shared/ipc'
import type { GeneratedIssueDraft, IssueDraft } from '@shared/types'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInMemoryDatabase } from '../db/client'
import { runMigrations } from '../db/migrations'
import { createAgentRun } from '../db/repositories/agent-runs'
import { listIssueDrafts } from '../db/repositories/issue-drafts'
import { createNote } from '../db/repositories/notes'
import { createRepo } from '../db/repositories/repos'
import { buildIssueGenerationPrompt, persistGeneratedIssueDrafts } from './issue-generation'
import { promptQualityFixtures, type PromptQualityFixture } from './prompt-quality-fixtures'
import { createIssueGenerationTools } from './runtime'

type RepoToolName = 'list_dir' | 'read_file' | 'grep' | 'git_status'

const REQUIRED_REPO_TOOLS = ['list_dir', 'read_file', 'grep', 'git_status'] as const
const FIXTURE_REPO_OWNER = 'pilog-fixtures'
const FIXTURE_REPO_TIMESTAMP = '2026-05-10T00:00:00.000Z'

export type PromptQualityFixtureResult = {
  id: PromptQualityFixture['id']
  title: string
  passed: boolean
  failures: string[]
  promptIncludesRepoPath: boolean
  repoToolCalls: RepoToolName[]
  templateApplied: boolean
  draftCount: number
  sourceNoteGroups: string[][]
  labels: string[][]
  affectedFiles: string[][]
  clarificationDraftCount: number
}

export type PromptQualityReport = {
  passed: boolean
  fixtures: PromptQualityFixtureResult[]
  fixturesById: Record<PromptQualityFixture['id'], PromptQualityFixtureResult>
}

type ExecutableTool = AgentTool & {
  execute: (toolCallId: string, input: Record<string, unknown>) => Promise<{ details?: unknown }>
}

export async function runPromptQualityLoop(): Promise<PromptQualityReport> {
  const fixtures: PromptQualityFixtureResult[] = []

  for (const fixture of promptQualityFixtures) {
    fixtures.push(await evaluatePromptQualityFixture(fixture))
  }

  return {
    passed: fixtures.every((fixture) => fixture.passed),
    fixtures,
    fixturesById: Object.fromEntries(fixtures.map((fixture) => [fixture.id, fixture])) as Record<
      PromptQualityFixture['id'],
      PromptQualityFixtureResult
    >
  }
}

async function evaluatePromptQualityFixture(
  fixture: PromptQualityFixture
): Promise<PromptQualityFixtureResult> {
  const repoPath = prepareFixtureRepo(fixture.id)
  const db = createInMemoryDatabase()
  runMigrations(db)
  const repo = createRepo(db, {
    owner: FIXTURE_REPO_OWNER,
    name: fixture.id,
    localPath: repoPath,
    githubUrl: createFixtureGithubUrl(fixture.id),
    defaultBranch: 'main'
  })
  const persistedNotes = fixture.notes.map((note) =>
    createNote(db, { content: note.content, repoId: repo.id })
  )
  const persistedNoteIdByFixtureId = createPersistedNoteIdMap(fixture, persistedNotes)
  const run = createAgentRun(db, {
    repoId: repo.id,
    inputNoteIds: persistedNotes.map((note) => note.id)
  })
  const prompt = buildIssueGenerationPrompt({
    repo,
    notes: createPromptNotes(fixture, persistedNotes)
  })
  const promptIncludesRepoPath = prompt.includes(repoPath)
  const repoToolCalls = await exerciseGenerationTools(fixture, repo.localPath)
  const normalizedDrafts = normalizeFixtureDrafts(fixture.response, fixture)
  const persistedDrafts = normalizedDrafts.map((draft) => ({
    ...draft,
    sourceNoteIds: draft.sourceNoteIds.map((id) =>
      getPersistedNoteId(persistedNoteIdByFixtureId, fixture.id, id)
    )
  }))

  persistGeneratedIssueDrafts(db, {
    runId: run.id,
    repoId: repo.id,
    selectedNoteIds: persistedNotes.map((note) => note.id),
    drafts: persistedDrafts,
    eventStream: [{ type: 'final', drafts: normalizedDrafts }]
  })

  const storedDrafts = listIssueDrafts(db, { status: 'all' })
  const result = createFixtureResult({
    fixture,
    promptIncludesRepoPath,
    repoToolCalls,
    normalizedDrafts,
    storedDrafts
  })

  return result
}

async function exerciseGenerationTools(
  fixture: PromptQualityFixture,
  repoPath: string
): Promise<RepoToolName[]> {
  let submittedDrafts: GeneratedIssueDraft[] | null = null
  const tools = createIssueGenerationTools(
    {
      repo: {
        id: fixture.id,
        owner: FIXTURE_REPO_OWNER,
        name: fixture.id,
        localPath: repoPath,
        githubUrl: createFixtureGithubUrl(fixture.id),
        defaultBranch: 'main',
        githubLabels: [],
        githubLabelsSyncedAt: null,
        autoPublishEnabled: false,
        autoPublishMaxIssuesPerRun: 5,
        autoPublishDefaultLabel: 'triaged-by-pilog',
        autoPublishDryRun: false,
        autoPublishRequireConfirmation: true,
        createdAt: FIXTURE_REPO_TIMESTAMP,
        updatedAt: FIXTURE_REPO_TIMESTAMP
      },
      webSearch: undefined
    },
    (drafts) => {
      submittedDrafts = drafts
    }
  )
  const calls: RepoToolName[] = []

  await executeTool(tools, 'list_dir', { path: 'src', depth: 3 })
  calls.push('list_dir')
  await executeTool(tools, 'read_file', { path: fixture.primaryFile })
  calls.push('read_file')
  await executeTool(tools, 'grep', { pattern: fixture.grepPattern, path: 'src' })
  calls.push('grep')
  await executeTool(tools, 'git_status', {})
  calls.push('git_status')
  await executeTool(tools, 'submit_issue_drafts', { drafts: fixture.response })

  if (!submittedDrafts) throw new Error(`Fixture ${fixture.id} did not submit issue drafts.`)

  return calls
}

async function executeTool(
  tools: AgentTool[],
  name: string,
  input: Record<string, unknown>
): Promise<{ details?: unknown }> {
  const tool = tools.find((candidate) => candidate.name === name) as ExecutableTool | undefined
  if (!tool) throw new Error(`Missing issue generation tool: ${name}`)
  return tool.execute(`prompt-quality:${name}`, input)
}

function normalizeFixtureDrafts(
  drafts: GeneratedIssueDraft[],
  fixture: PromptQualityFixture
): GeneratedIssueDraft[] {
  return drafts.map((draft) => {
    const labelMatches = matchLabelsToRepoLabels(draft.suggestedLabels, fixture.repoLabels)
    return {
      ...draft,
      suggestedLabels: labelMatches.map((match) => match.name),
      labelMatches
    }
  })
}

function createFixtureResult(input: {
  fixture: PromptQualityFixture
  promptIncludesRepoPath: boolean
  repoToolCalls: RepoToolName[]
  normalizedDrafts: GeneratedIssueDraft[]
  storedDrafts: IssueDraft[]
}): PromptQualityFixtureResult {
  const { fixture, promptIncludesRepoPath, repoToolCalls, normalizedDrafts, storedDrafts } = input
  const labels = normalizedDrafts.map((draft) => draft.suggestedLabels)
  const affectedFiles = normalizedDrafts.map((draft) =>
    draft.affectedFiles.map((file) => file.path)
  )
  const sourceNoteGroups = normalizedDrafts.map((draft) => draft.sourceNoteIds)
  const clarificationDraftCount = normalizedDrafts.filter(
    (draft) => (draft.needsClarification?.length ?? 0) > 0
  ).length
  const templateApplied = didApplyFixtureTemplate(storedDrafts, normalizedDrafts.length)
  const failures: string[] = []

  expectEqual(failures, 'draft count', normalizedDrafts.length, fixture.expected.draftCount)
  expectEqual(failures, 'source note grouping', sourceNoteGroups, fixture.expected.sourceNoteGroups)
  expectEqual(failures, 'labels', labels, fixture.expected.labels)
  expectEqual(failures, 'affected files', affectedFiles, fixture.expected.affectedFiles)
  expectEqual(
    failures,
    'clarification draft count',
    clarificationDraftCount,
    fixture.expected.clarificationDraftCount
  )
  expectIncludes(
    failures,
    'acceptance criteria',
    normalizedDrafts.map((draft) => draft.acceptanceCriteria),
    fixture.expected.acceptanceCriteriaIncludes
  )
  expectIncludes(
    failures,
    'implementation notes',
    normalizedDrafts.map((draft) => draft.implementationNotes),
    fixture.expected.implementationNotesIncludes ?? []
  )
  if (!promptIncludesRepoPath) failures.push('prompt omitted the fixture repo path')
  for (const toolName of REQUIRED_REPO_TOOLS) {
    if (!repoToolCalls.includes(toolName)) failures.push(`repo tool was not exercised: ${toolName}`)
  }
  if (!templateApplied) failures.push('repo issue template was not applied to persisted drafts')

  return {
    id: fixture.id,
    title: fixture.title,
    passed: failures.length === 0,
    failures,
    promptIncludesRepoPath,
    repoToolCalls,
    templateApplied,
    draftCount: normalizedDrafts.length,
    sourceNoteGroups,
    labels,
    affectedFiles,
    clarificationDraftCount
  }
}

function expectEqual(failures: string[], label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label} expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`)
  }
}

function expectIncludes(
  failures: string[],
  label: string,
  actual: string[][],
  expectedIncludes: string[][]
): void {
  expectedIncludes.forEach((expectedItems, index) => {
    const actualItems = actual[index] ?? []
    for (const expected of expectedItems) {
      if (!actualItems.includes(expected)) {
        failures.push(`${label} draft ${index + 1} missed ${JSON.stringify(expected)}`)
      }
    }
  })
}

function createPersistedNoteIdMap(
  fixture: PromptQualityFixture,
  persistedNotes: Array<{ id: string }>
): Map<string, string> {
  return new Map(
    fixture.notes.map((note, index) => {
      const persistedNote = persistedNotes[index]
      if (!persistedNote) {
        throw new Error(`Fixture ${fixture.id} did not persist note ${note.id}.`)
      }

      return [note.id, persistedNote.id]
    })
  )
}

function createPromptNotes(fixture: PromptQualityFixture, persistedNotes: Note[]): Note[] {
  return fixture.notes.map((note, index) => {
    const persistedNote = persistedNotes[index]
    if (!persistedNote) {
      throw new Error(`Fixture ${fixture.id} did not persist note ${note.id}.`)
    }

    return {
      ...persistedNote,
      id: note.id,
      content: note.content
    }
  })
}

function getPersistedNoteId(
  noteIdByFixtureId: Map<string, string>,
  fixtureId: PromptQualityFixture['id'],
  noteId: string
): string {
  const persistedNoteId = noteIdByFixtureId.get(noteId)
  if (!persistedNoteId) {
    throw new Error(`Fixture ${fixtureId} draft referenced unknown source note ${noteId}.`)
  }

  return persistedNoteId
}

function didApplyFixtureTemplate(storedDrafts: IssueDraft[], expectedDraftCount: number): boolean {
  return (
    storedDrafts.length === expectedDraftCount &&
    storedDrafts.every(
      (draft) =>
        draft.body.includes('## Pilog Review Notes') &&
        draft.body.includes('<!-- Fixture template marker -->')
    )
  )
}

function createFixtureGithubUrl(id: PromptQualityFixture['id']): string {
  return `https://github.com/${FIXTURE_REPO_OWNER}/${id}`
}

function prepareFixtureRepo(id: PromptQualityFixture['id']): string {
  const root = mkdtempSync(path.join(tmpdir(), `pilog-prompt-quality-${id}-`))
  const repoPath = path.join(root, 'repo')
  cpSync(path.join(process.cwd(), 'fixtures', 'prompt-quality', id, 'repo'), repoPath, {
    recursive: true
  })
  execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.email', 'pilog@example.com'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.name', 'Pilog'], { cwd: repoPath })
  execFileSync('git', ['add', '.'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'Initial prompt-quality fixture'], { cwd: repoPath })
  return repoPath
}
