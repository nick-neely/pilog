import type { Repo, RepoAccessDescriptor } from './ipc'

type RepoLocationDisplay = {
  label: string
  title: string
  context: string | null
}

export function repoAccessFromRepo(repo: Repo): RepoAccessDescriptor {
  if (repo.accessKind === 'wsl' && repo.wslDistro && repo.wslPath) {
    return {
      kind: 'wsl',
      displayPath: repo.localPath,
      distro: repo.wslDistro,
      linuxPath: repo.wslPath
    }
  }

  return { kind: 'host', displayPath: repo.localPath }
}

export function formatRepoLocation(repo: Repo): RepoLocationDisplay {
  const access = repoAccessFromRepo(repo)
  if (access.kind === 'wsl') {
    const label = `WSL ${access.distro}: ${access.linuxPath}`
    return {
      label,
      title: `${label}\n${access.displayPath}`,
      context: `Paths are relative to WSL ${access.distro}: ${access.linuxPath}.`
    }
  }

  return {
    label: access.displayPath,
    title: access.displayPath,
    context: null
  }
}

export function resolveWslLinuxPath(
  access: Extract<RepoAccessDescriptor, { kind: 'wsl' }>,
  filePath: string
): string {
  if (filePath.startsWith('/')) return normalizeLinuxPath(filePath)
  return normalizeLinuxPath(`${access.linuxPath}/${filePath}`)
}

function normalizeLinuxPath(value: string): string {
  const segments: string[] = []
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  return `/${segments.join('/')}`
}
