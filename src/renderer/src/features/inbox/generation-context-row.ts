import type { Note, RepoDraftSettings } from '@shared/ipc'
import type { GenerationRepoIndexStatusView } from '../repositories/repo-index-status'
import { draftSettingsSummary } from '../repositories/repo-draft-defaults'

export type GenerationContextRowItem = {
  label: string
  value: string
}

export type GenerationContextRowView = {
  items: GenerationContextRowItem[]
  ariaLabel: string
}

export function getGenerationContextRowView(input: {
  repoIndexStatus: GenerationRepoIndexStatusView | null
  notes: Note[]
  draftSettings: RepoDraftSettings | null
}): GenerationContextRowView | null {
  const items: GenerationContextRowItem[] = []

  if (input.repoIndexStatus && input.repoIndexStatus.state !== 'unavailable') {
    items.push({
      label: 'Repo Index',
      value: getRepoIndexFreshnessLabel(input.repoIndexStatus)
    })
  }

  const captureContext = summarizeCaptureContext(input.notes)
  if (captureContext.branch) {
    items.push({ label: captureContext.branch.label, value: captureContext.branch.value })
  }
  if (captureContext.changedFiles) {
    items.push({ label: 'Changed files', value: String(captureContext.changedFiles) })
  }

  if (input.draftSettings) {
    items.push({ label: 'Style', value: draftSettingsSummary(input.draftSettings) })
  }

  if (items.length === 0) return null

  return {
    items,
    ariaLabel: items.map((item) => `${item.label}: ${item.value}`).join('. ')
  }
}

function getRepoIndexFreshnessLabel(status: GenerationRepoIndexStatusView): string {
  switch (status.state) {
    case 'fresh':
      return 'Fresh'
    case 'stale':
      return 'Stale'
    case 'missing':
      return 'Not indexed'
    case 'unavailable':
      return status.shortLabel
  }
}

function summarizeCaptureContext(notes: Note[]): {
  branch: GenerationContextRowItem | null
  changedFiles: number | null
} {
  const branches = new Set<string>()
  const changedFiles = new Set<string>()
  let diffSummaryChangedFiles = 0

  notes.forEach((note) => {
    const context = note.captureContext
    if (!context || context.state !== 'captured') return
    if (context.branch) branches.add(context.branch)
    context.dirtyFiles.forEach((path) => changedFiles.add(path))
    context.stagedFiles.forEach((path) => changedFiles.add(path))
    diffSummaryChangedFiles = Math.max(
      diffSummaryChangedFiles,
      context.diffSummary?.filesChanged ?? 0
    )
  })

  const changedCount = changedFiles.size > 0 ? changedFiles.size : diffSummaryChangedFiles

  return {
    branch: summarizeBranches(branches),
    changedFiles: changedCount > 0 ? changedCount : null
  }
}

function summarizeBranches(branches: ReadonlySet<string>): GenerationContextRowItem | null {
  if (branches.size === 0) return null
  if (branches.size === 1) {
    return { label: 'Branch', value: Array.from(branches)[0] ?? '' }
  }

  return { label: 'Branches', value: String(branches.size) }
}
