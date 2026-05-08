import { Agent, type AgentEvent as PiAgentEvent } from '@earendil-works/pi-agent-core'
import { getModel } from '@earendil-works/pi-ai'
import { createModelRegistry, createSafeStorageAuthStorage } from './auth-storage'
import {
  buildIssueGenerationPrompt,
  createSubmitIssueDraftsTool,
  type IssueGenerationInput
} from './issue-generation'
import { createAsyncQueue } from '@shared/async-queue'
import type { AgentEvent, GeneratedIssueDraft } from '@shared/types'

export type ProcessSnapshot = {
  cwd: string
  env: Record<string, string | undefined>
  exit: typeof process.exit
  sigintListeners: number
  sigtermListeners: number
}

export function snapshotProcessState(): ProcessSnapshot {
  return {
    cwd: process.cwd(),
    env: { ...process.env },
    exit: process.exit,
    sigintListeners: process.listenerCount('SIGINT'),
    sigtermListeners: process.listenerCount('SIGTERM')
  }
}

export function assertProcessStateUnchanged(before: ProcessSnapshot): void {
  const after = snapshotProcessState()
  if (
    before.cwd !== after.cwd ||
    before.exit !== after.exit ||
    before.sigintListeners !== after.sigintListeners ||
    before.sigtermListeners !== after.sigtermListeners ||
    JSON.stringify(before.env) !== JSON.stringify(after.env)
  ) {
    throw new Error('Pi runtime mutated process state.')
  }
}

export async function* runAgent(input: IssueGenerationInput): AsyncIterable<AgentEvent> {
  if (input.provider === 'pilog-fixture') {
    yield* runFixtureAgent(input)
    return
  }

  const before = snapshotProcessState()
  const prompt = buildIssueGenerationPrompt({ repo: input.repo, notes: input.notes })
  const authStorage = createSafeStorageAuthStorage()
  const registry = createModelRegistry(authStorage)
  const model =
    registry.find(input.provider, input.model) ??
    (getModel as (provider: string, modelId: string) => ReturnType<typeof getModel>)(
      input.provider,
      input.model
    )
  const auth = await registry.getApiKeyAndHeaders(model)

  if (!auth.ok) {
    yield { type: 'error', message: auth.error, cause: 'auth_invalid' }
    return
  }

  const queue = createAsyncQueue<AgentEvent>()
  let submittedDrafts: GeneratedIssueDraft[] | null = null
  let toolCallCount = 0
  let agentEndSeen = false

  const agent = new Agent({
    initialState: {
      systemPrompt: prompt,
      model,
      tools: [
        createSubmitIssueDraftsTool((drafts) => {
          submittedDrafts = drafts
        })
      ]
    },
    getApiKey: (provider) => (provider === input.provider ? auth.apiKey : undefined),
    toolExecution: 'sequential'
  })

  input.signal?.addEventListener('abort', () => agent.abort(), { once: true })

  agent.subscribe((event: PiAgentEvent) => {
    if (event.type === 'turn_start') queue.push({ type: 'progress', phase: 'turn_start' })
    if (event.type === 'tool_execution_start') {
      queue.push({ type: 'progress', phase: event.toolName })
      if (event.toolName === 'submit_issue_drafts') toolCallCount += 1
    }
    if (
      event.type === 'message_update' &&
      event.assistantMessageEvent.type === 'text_delta' &&
      event.assistantMessageEvent.delta
    ) {
      queue.push({ type: 'partial', text: event.assistantMessageEvent.delta })
    }
    if (
      event.type === 'tool_execution_end' &&
      event.toolName === 'submit_issue_drafts' &&
      submittedDrafts
    ) {
      queue.push({ type: 'final', drafts: submittedDrafts })
    }
    if (event.type === 'agent_end') {
      agentEndSeen = true
      queue.close()
    }
  })

  void agent.prompt(prompt).catch((error) => {
    queue.push({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      cause: input.signal?.aborted ? 'cancelled' : 'pi_internal'
    })
    queue.close()
  })

  for await (const event of queue) {
    yield event
  }

  if (submittedDrafts && (!agentEndSeen || toolCallCount !== 1)) {
    agent.abort()
  }

  assertProcessStateUnchanged(before)
}

async function* runFixtureAgent(input: IssueGenerationInput): AsyncIterable<AgentEvent> {
  yield { type: 'progress', phase: 'agent_start' }
  yield { type: 'partial', text: 'Generating one issue draft from selected notes.' }
  yield {
    type: 'final',
    drafts: [
      {
        title: 'Triage selected PiLog notes',
        summary: input.notes
          .map((note) => note.content.trim())
          .filter(Boolean)
          .join('\n'),
        context: `Generated from ${input.notes.length} selected notes for ${input.repo.owner}/${input.repo.name}.`,
        sourceNoteIds: input.notes.map((note) => note.id),
        suggestedLabels: ['triaged-by-pilog'],
        affectedFiles: [],
        acceptanceCriteria: ['A persisted issue draft exists for the selected notes.'],
        implementationNotes: ['Review the source notes before publishing.'],
        confidence: 'medium',
        groupingReason: 'Tracer bullet groups all selected notes into one draft.',
        publishReady: true
      }
    ]
  }
}
