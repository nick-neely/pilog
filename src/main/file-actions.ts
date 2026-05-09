import { existsSync } from 'node:fs'
import { isAbsolute, join, normalize } from 'node:path'
import { clipboard, shell } from 'electron'
import type { PathActionRequest, PathActionResult } from '@shared/ipc'

type PathActionDependencies = {
  writeText: (text: string) => void
  showItemInFolder: (path: string) => void
  exists: (path: string) => boolean
}

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

function resolvePath(request: PathActionRequest): string {
  if (isAbsolute(request.path) || !request.repoPath) return request.path
  return normalize(join(request.repoPath, request.path))
}

export const pathActions = createPathActions({
  writeText: (text) => clipboard.writeText(text),
  showItemInFolder: (path) => shell.showItemInFolder(path),
  exists: (path) => existsSync(path)
})
