import type { RepoIndexStatus } from '@shared/ipc'

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

function formatIndexDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}
