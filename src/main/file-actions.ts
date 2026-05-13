import { existsSync } from 'node:fs'
import { isAbsolute, join, normalize, win32 } from 'node:path'
import { clipboard, shell } from 'electron'
import type { PathActionRequest, PathActionResult, RepoAccessDescriptor } from '@shared/ipc'
import { resolveWslLinuxPath } from '@shared/repo-paths'

type PathActionDependencies = {
  writeText: (text: string) => void
  showItemInFolder: (path: string) => void
  exists: (path: string) => boolean
}
type WslRepoAccess = Extract<RepoAccessDescriptor, { kind: 'wsl' }>

export function createPathActions(deps: PathActionDependencies): {
  copyPath: (request: PathActionRequest) => Promise<PathActionResult>
  revealPath: (request: PathActionRequest) => Promise<PathActionResult>
} {
  return {
    async copyPath(request) {
      try {
        deps.writeText(request.path)
        return { ok: true }
      } catch {
        return { ok: false, reason: 'unavailable' }
      }
    },
    async revealPath(request) {
      const access = request.repoAccess
      if (access?.kind === 'wsl') {
        return revealWslPath(request, access, deps)
      }

      const resolvedPath = resolvePath(request)
      if (!deps.exists(resolvedPath)) {
        return { ok: false, reason: 'missing' }
      }

      try {
        deps.showItemInFolder(resolvedPath)
        return { ok: true }
      } catch {
        return { ok: false, reason: 'unavailable' }
      }
    }
  }
}

function revealWslPath(
  request: PathActionRequest,
  access: WslRepoAccess,
  deps: PathActionDependencies
): PathActionResult {
  const windowsPath = resolveWslWindowsPath(request, access)
  if (windowsPath && deps.exists(windowsPath)) {
    try {
      deps.showItemInFolder(windowsPath)
      return { ok: true }
    } catch {
      return copyWslFallbackPath(request, access, deps)
    }
  }

  return copyWslFallbackPath(request, access, deps)
}

function copyWslFallbackPath(
  request: PathActionRequest,
  access: WslRepoAccess,
  deps: PathActionDependencies
): PathActionResult {
  const fallbackPath = resolveWslLinuxPath(access, request.path)
  try {
    deps.writeText(fallbackPath)
    return { ok: false, reason: 'copied-fallback', fallbackPath }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

function resolveWslWindowsPath(request: PathActionRequest, access: WslRepoAccess): string | null {
  const displayPath = access.displayPath || request.repoPath
  if (!displayPath || !displayPath.startsWith('\\\\')) return null
  if (win32.isAbsolute(request.path)) return request.path
  if (request.path.startsWith('/')) return null
  return win32.normalize(win32.join(displayPath, request.path))
}

function resolvePath(request: PathActionRequest): string {
  if (isAbsolute(request.path) || !request.repoPath) return request.path
  return normalize(join(request.repoPath, request.path))
}

export const pathActions = createPathActions({
  writeText: (text) => clipboard.writeText(text),
  showItemInFolder: (path) => shell.showItemInFolder(path),
  exists: (path) => existsSync(path)
})
