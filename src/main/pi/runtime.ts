import type { AgentEvent as PiAgentEvent, AgentTool } from '@earendil-works/pi-agent-core'
import type { getModel as getModelType } from '@earendil-works/pi-ai'
import { setTimeout as delay } from 'node:timers/promises'
import { createModelRegistry, createSafeStorageAuthStorage } from './auth-storage'
import {
  buildIssueGenerationPrompt,
  createSubmitIssueDraftsTool,
  type IssueGenerationInput
} from './issue-generation'
import { createReadOnlyRepoTools } from './tools/repo-tools'
import { createWebSearchTool } from './tools/web-search'
import { createAsyncQueue } from '@shared/async-queue'
import type { AgentEvent, ErrorCause, GeneratedIssueDraft } from '@shared/types'

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
  const [{ Agent }, { getModel }] = await Promise.all([
    import('@earendil-works/pi-agent-core'),
    import('@earendil-works/pi-ai')
  ])
  const prompt = buildIssueGenerationPrompt({ repo: input.repo, notes: input.notes })
  const authStorage = await createSafeStorageAuthStorage()
  const registry = await createModelRegistry(authStorage)
  const model =
    registry.find(input.provider, input.model) ??
    (getModel as (provider: string, modelId: string) => ReturnType<typeof getModelType>)(
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
  let turnCount = 0
  let turnBudgetExceeded = false
  let agentEndSeen = false

  const agent = new Agent({
    initialState: {
      systemPrompt: prompt,
      model,
      tools: createIssueGenerationTools(input, (drafts) => {
        submittedDrafts = drafts
      })
    },
    getApiKey: (provider) => (provider === input.provider ? auth.apiKey : undefined),
    toolExecution: 'parallel'
  })

  const abortAgent = (): void => {
    agent.abort()
    queue.push(createAbortEvent(input.signal))
    queue.close()
  }
  agent.subscribe((event: PiAgentEvent) => {
    switch (event.type) {
      case 'turn_start': {
        turnCount += 1
        if (turnCount > input.turnBudget) {
          turnBudgetExceeded = true
          agent.abort()
          queue.push(createTurnBudgetExceededEvent(input.turnBudget))
          queue.close()
          return
        }
        queue.push({ type: 'progress', phase: 'turn_start' })
        return
      }
      case 'tool_execution_start': {
        queue.push({ type: 'progress', phase: event.toolName })
        if (event.toolName === 'submit_issue_drafts') toolCallCount += 1
        return
      }
      case 'message_update': {
        if (
          event.assistantMessageEvent.type === 'text_delta' &&
          event.assistantMessageEvent.delta
        ) {
          queue.push({ type: 'partial', text: event.assistantMessageEvent.delta })
        }
        return
      }
      case 'tool_execution_end': {
        if (event.toolName === 'submit_issue_drafts' && submittedDrafts) {
          queue.push({ type: 'final', drafts: submittedDrafts })
        }
        return
      }
      case 'agent_end': {
        agentEndSeen = true
        queue.close()
        return
      }
    }
  })

  if (input.signal?.aborted) {
    abortAgent()
  } else {
    input.signal?.addEventListener('abort', abortAgent, { once: true })
    void agent.prompt(prompt).catch((error) => {
      queue.push({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        cause: input.signal?.aborted ? createAbortEvent(input.signal).cause : 'pi_internal'
      })
      queue.close()
    })
  }

  for await (const event of queue) {
    yield event
  }

  if (submittedDrafts && (!agentEndSeen || toolCallCount !== 1)) {
    agent.abort()
  }

  input.signal?.removeEventListener('abort', abortAgent)
  if (input.signal?.aborted || turnBudgetExceeded) return

  assertProcessStateUnchanged(before)
}

export function createIssueGenerationTools(
  input: Pick<IssueGenerationInput, 'repo' | 'webSearch'>,
  onSubmit: (drafts: GeneratedIssueDraft[]) => void
): AgentTool[] {
  return [
    ...createReadOnlyRepoTools(input.repo.localPath),
    ...(input.webSearch ? [createWebSearchTool(input.webSearch)] : []),
    createSubmitIssueDraftsTool(onSubmit)
  ]
}

async function* runFixtureAgent(input: IssueGenerationInput): AsyncIterable<AgentEvent> {
  if (input.model === 'turn-budget-loop') {
    for (let turn = 1; turn <= input.turnBudget + 1; turn += 1) {
      yield { type: 'progress', phase: 'turn_start' }
      await delay(5, undefined, { signal: input.signal }).catch(() => undefined)
      if (input.signal?.aborted) return
    }
    yield createTurnBudgetExceededEvent(input.turnBudget)
    return
  }

  yield { type: 'progress', phase: 'agent_start' }
  await delay(150, undefined, { signal: input.signal }).catch(() => undefined)
  if (input.signal?.aborted) return
  yield { type: 'partial', text: 'Generating one issue draft from selected notes.' }
  await delay(50, undefined, { signal: input.signal }).catch(() => undefined)
  if (input.signal?.aborted) return
  yield {
    type: 'final',
    drafts: [
      {
        title: 'Triage selected Pilog notes',
        summary: input.notes
          .flatMap((note) => {
            const content = note.content.trim()
            return content ? [content] : []
          })
          .join('\n'),
        context: `Generated from ${input.notes.length} selected notes for ${input.repo.owner}/${input.repo.name}.`,
        sourceNoteIds: input.notes.map((note) => note.id),
        suggestedLabels: ['triaged-by-pilog'],
        affectedFiles: [
          {
            path: 'package.json',
            reason:
              'Debug fixture uses a repository root file as a stable affected-file placeholder.'
          }
        ],
        acceptanceCriteria: ['A persisted issue draft exists for the selected notes.'],
        implementationNotes: ['Review the source notes before publishing.'],
        confidence: 'medium',
        groupingReason: 'Tracer bullet groups all selected notes into one draft.',
        publishReady: true
      }
    ]
  }
}

function createTurnBudgetExceededEvent(turnBudget: number): AgentEvent & {
  type: 'error'
  cause: Extract<ErrorCause, 'turn_budget_exceeded'>
} {
  return {
    type: 'error',
    message: `Turn budget exceeded after ${turnBudget} turns.`,
    cause: 'turn_budget_exceeded'
  }
}

function createAbortEvent(signal: AbortSignal | undefined): AgentEvent & { type: 'error' } {
  const timedOut = signal?.reason === 'timeout'
  return {
    type: 'error',
    message: timedOut
      ? 'Generation timed out before Pi returned issue drafts.'
      : 'Generation cancelled.',
    cause: timedOut ? 'timeout' : 'cancelled'
  }
}
