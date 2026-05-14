import type { RepoIndexStatus } from '@shared/ipc'

export function getRepoIndexStatusLabel(repoIndex: RepoIndexStatus | null): {
  label: string
  ariaLabel: string
} {
  if (!repoIndex) {
    return {
      label: 'Not created',
      ariaLabel: 'Repo Index not created'
    }
  }

  if (repoIndex.status === 'failed') {
    const failureDetail = repoIndex.errorMessage ? `: ${repoIndex.errorMessage}` : ''
    return {
      label: `Failed${failureDetail}`,
      ariaLabel: `Repo Index failed${failureDetail}`
    }
  }

  const indexedAt = formatIndexDate(repoIndex.lastIndexedAt)
  return {
    label: `Indexed ${indexedAt}`,
    ariaLabel: `Repo Index last indexed ${indexedAt}`
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
