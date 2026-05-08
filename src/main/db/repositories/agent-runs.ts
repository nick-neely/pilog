import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import type { PilogDatabase } from '../client'
import { agentRuns } from '../schema'
import type { AgentRunStatus, ErrorCause } from '@shared/types'

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
