import type { Repo, RepoIndexStatus } from '@shared/ipc'

export const REPO_INDEX_PRIVACY_COPY =
  'Repo Index stores structure and lightweight signals only. File contents, embeddings, and long code summaries stay out of the index; Agent Runs use Live Repo Evidence for specific code claims.'

const STALE_REPO_INDEX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const LIVE_REPO_EVIDENCE_NOTICE =
  'Live file checks through Live Repo Evidence ground specific file claims before drafts are saved.'

export type GenerationRepoIndexState = 'fresh' | 'stale' | 'missing' | 'unavailable'

export type GenerationRepoIndexStatusView = {
  state: GenerationRepoIndexState
  label: string
  ariaLabel: string
  notice: string | null
  blocksGeneration: boolean
}

type GenerationRepoIndexRepo = Pick<Repo, 'name' | 'repoIndex'> | null

export function getRepoIndexStatusLabel(
  repoIndex: RepoIndexStatus | null,
  options: { refreshing?: boolean } = {}
): {
  label: string
  ariaLabel: string
  canRefresh: boolean
} {
  if (!repoIndex) {
    return {
      label: 'Not created',
      ariaLabel: 'Repo Index not created',
      canRefresh: false
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
      canRefresh: false
    }
  }

  if (repoIndex.status === 'failed') {
    const failureDetail = repoIndex.errorMessage ? `: ${repoIndex.errorMessage}` : ''
    return {
      label: `Failed${failureDetail}`,
      ariaLabel: `Repo Index failed${failureDetail}`,
      canRefresh: true
    }
  }

  const indexedAt = formatIndexDate(repoIndex.lastIndexedAt)
  return {
    label: `Indexed ${indexedAt}`,
    ariaLabel: `Repo Index last indexed ${indexedAt}`,
    canRefresh: true
  }
}

export function getGenerationRepoIndexStatus(
  repo: GenerationRepoIndexRepo,
  options: { now?: Date } = {}
): GenerationRepoIndexStatusView {
  if (!repo) {
    return {
      state: 'unavailable',
      label: 'Repo Index unavailable',
      ariaLabel: 'Repository unavailable before draft generation',
      notice:
        'Relink the repository before generating drafts. Existing readiness checks stop generation before a run starts.',
      blocksGeneration: true
    }
  }

  const repoName = repo.name
  const repoIndex = repo.repoIndex ?? null
  if (!repoIndex || (repoIndex.status === 'failed' && !repoIndex.lastIndexedAt)) {
    return {
      state: 'missing',
      label: 'Repo Index missing',
      ariaLabel: `Repo Index missing for ${repoName}`,
      notice: LIVE_REPO_EVIDENCE_NOTICE,
      blocksGeneration: false
    }
  }

  const indexedAt = repoIndex.lastIndexedAt ? formatIndexDate(repoIndex.lastIndexedAt) : 'unknown'
  if (
    repoIndex.status === 'failed' ||
    isStaleRepoIndex(repoIndex.lastIndexedAt, options.now ?? new Date())
  ) {
    return {
      state: 'stale',
      label: `Repo Index stale, indexed ${indexedAt}`,
      ariaLabel: `Repo Index stale for ${repoName}. Last indexed ${indexedAt}`,
      notice: LIVE_REPO_EVIDENCE_NOTICE,
      blocksGeneration: false
    }
  }

  return {
    state: 'fresh',
    label: `Repo Index fresh, indexed ${indexedAt}`,
    ariaLabel: `Repo Index fresh for ${repoName}. Last indexed ${indexedAt}`,
    notice: null,
    blocksGeneration: false
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
