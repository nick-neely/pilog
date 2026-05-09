import type { PublishAuditLogEntry } from '@shared/ipc'

export type PublishAuditEntryViewModel = {
  repoLabel: string
  title: string
  sourceSummary: string
  canOpenDraft: boolean
}

export function getPublishAuditEntryViewModel(
  entry: PublishAuditLogEntry
): PublishAuditEntryViewModel {
  const sourceCount = entry.sourceNotes.length

  return {
    repoLabel: `${entry.repo.owner}/${entry.repo.name}`,
    title: entry.draftTitle?.trim() || 'Hand-written GitHub issue',
    sourceSummary:
      sourceCount === 0
        ? 'No local draft was linked to this publish.'
        : `${sourceCount} source ${sourceCount === 1 ? 'note' : 'notes'}`,
    canOpenDraft: entry.draftId !== null
  }
}

export function isSafeBrowserUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}
