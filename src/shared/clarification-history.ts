import type { ClarificationHistoryEntry } from './types'

export function parseClarificationHistory(value: string): ClarificationHistoryEntry[] {
  const parsed = JSON.parse(value) as unknown
  if (!Array.isArray(parsed)) return []

  return parsed.filter(isClarificationHistoryEntry)
}

function isClarificationHistoryEntry(value: unknown): value is ClarificationHistoryEntry {
  if (value === null || typeof value !== 'object') return false

  return (
    'question' in value &&
    'answer' in value &&
    'answeredAt' in value &&
    typeof value.question === 'string' &&
    typeof value.answer === 'string' &&
    typeof value.answeredAt === 'string'
  )
}
