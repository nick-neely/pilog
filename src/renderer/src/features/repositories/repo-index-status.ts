import type { Repo, RepoIndexStatus } from '@shared/ipc'

export const REPO_INDEX_PRIVACY_COPY =
  'Repo Index stores structure and lightweight signals only. File contents, embeddings, and long code summaries stay out of the index; Agent Runs use Live Repo Evidence for specific code claims.'

const STALE_REPO_INDEX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const LIVE_REPO_EVIDENCE_NOTICE =
  'Live Repo Evidence will verify specific file claims during generation.'

export type GenerationRepoIndexState = 'fresh' | 'stale' | 'missing' | 'unavailable'

export type GenerationRepoIndexStatusView = {
  state: GenerationRepoIndexState
  label: string
  shortLabel: string
  ariaLabel: string
  notice: string | null
  blocksGeneration: boolean
}

type GenerationRepoIndexRepo = Pick<Repo, 'name' | 'repoIndex'> | null

export type RepoIndexStatusView = {
  label: string
  ariaLabel: string
  canRefresh: boolean
  actionLabel: string
}

export function getRepoIndexStatusLabel(
  repoIndex: RepoIndexStatus | null,
  options: { refreshing?: boolean } = {}
): RepoIndexStatusView {
  if (!repoIndex) {
    return {
      label: 'Not created',
      ariaLabel: 'Repo Index not created',
      canRefresh: true,
      actionLabel: 'Create index'
    }
  }

  if (options.refreshing) {
    const indexedAt = repoIndex.lastIndexedAt
      ? ` Last indexed ${formatIndexDate(repoIndex.lastIndexedAt)}.`
      : ''
    return {
      label: repoIndex.lastIndexedAt
        ? `Refreshing (indexed ${formatIndexDate(repoIndex.lastIndexedAt)})`
        : 'Refreshing',
      ariaLabel: `Repo Index refresh in progress.${indexedAt}`,
      canRefresh: false,
      actionLabel: 'Indexing…'
    }
  }

  if (repoIndex.status === 'failed') {
    const failureDetail = repoIndex.errorMessage ? `: ${repoIndex.errorMessage}` : ''
    return {
      label: `Failed${failureDetail}`,
      ariaLabel: `Repo Index failed${failureDetail}`,
      canRefresh: true,
      actionLabel: repoIndex.lastIndexedAt ? 'Retry index' : 'Create index'
    }
  }

  const indexedAt = formatIndexDate(repoIndex.lastIndexedAt)
  return {
    label: `Indexed ${indexedAt}`,
    ariaLabel: `Repo Index last indexed ${indexedAt}`,
    canRefresh: true,
    actionLabel: 'Re-index repo'
  }
}

export function getGenerationRepoIndexStatus(
  repo: GenerationRepoIndexRepo,
  options: { now?: Date } = {}
): GenerationRepoIndexStatusView {
  if (!repo) {
    return generationRepoIndexStatus({
      state: 'unavailable',
      label: 'Repo Index unavailable',
      shortLabel: 'Unavailable',
      ariaLabel: 'Repository unavailable before draft generation',
      notice:
        'Relink the repository before generating drafts. Existing readiness checks stop generation before a run starts.',
      blocksGeneration: true
    })
  }

  const repoName = repo.name
  const repoIndex = repo.repoIndex ?? null
  if (!repoIndex || (repoIndex.status === 'failed' && !repoIndex.lastIndexedAt)) {
    return generationRepoIndexStatus({
      state: 'missing',
      label: 'Repo Index missing',
      shortLabel: 'Not indexed',
      ariaLabel: `Repo Index missing for ${repoName}`,
      notice: LIVE_REPO_EVIDENCE_NOTICE
    })
  }

  const indexedAt = repoIndex.lastIndexedAt ? formatIndexDate(repoIndex.lastIndexedAt) : 'unknown'
  if (
    repoIndex.status === 'failed' ||
    isStaleRepoIndex(repoIndex.lastIndexedAt, options.now ?? new Date())
  ) {
    return generationRepoIndexStatus({
      state: 'stale',
      label: `Repo Index stale, indexed ${indexedAt}`,
      shortLabel: `Stale, indexed ${indexedAt}`,
      ariaLabel: `Repo Index stale for ${repoName}. Last indexed ${indexedAt}`,
      notice: LIVE_REPO_EVIDENCE_NOTICE
    })
  }

  return generationRepoIndexStatus({
    state: 'fresh',
    label: `Repo Index fresh, indexed ${indexedAt}`,
    shortLabel: `Indexed ${indexedAt}`,
    ariaLabel: `Repo Index fresh for ${repoName}. Last indexed ${indexedAt}`,
    notice: null
  })
}

function generationRepoIndexStatus(
  view: Omit<GenerationRepoIndexStatusView, 'blocksGeneration'> & {
    blocksGeneration?: boolean
  }
): GenerationRepoIndexStatusView {
  return {
    blocksGeneration: false,
    ...view
  }
}

function isStaleRepoIndex(value: string, now: Date): boolean {
  const indexedAt = new Date(value)
  if (Number.isNaN(indexedAt.getTime())) return true
  return now.getTime() - indexedAt.getTime() > STALE_REPO_INDEX_AGE_MS
}

function formatIndexDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}
