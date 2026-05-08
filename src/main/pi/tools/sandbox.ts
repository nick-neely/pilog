import { realpathSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_DENYLIST = {
  allowNodeModules: false
}

export type RepoSandbox = {
  root: string
  resolvePath(inputPath?: string): string
  assertPattern(pattern: string): void
  assertResolvedPath(resolvedPath: string): string
}

export function createRepoSandbox(
  repoPath: string,
  options: { allowNodeModules?: boolean } = DEFAULT_DENYLIST
): RepoSandbox {
  const root = realpathSync(repoPath)

  function assertRelativeAllowed(relativePath: string): void {
    const normalized = relativePath.split(path.sep).join('/')
    const segments = normalized.split('/').filter(Boolean)

    if (normalized === '.git/objects' || normalized.startsWith('.git/objects/')) {
      throw new Error('Tool path is denied: .git/objects is not readable.')
    }

    if (!options.allowNodeModules && segments.includes('node_modules')) {
      throw new Error('Tool path is denied: node_modules is not readable.')
    }

    if (segments.some((segment) => segment === '.env' || segment.startsWith('.env.'))) {
      throw new Error('Tool path is denied: .env files are not readable.')
    }
  }

  function assertContained(realPath: string): string {
    const relativePath = path.relative(root, realPath)
    if (relativePath === '') return relativePath
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Tool path escapes the selected repository.')
    }
    return relativePath
  }

  return {
    root,
    resolvePath(inputPath = '.'): string {
      if (path.isAbsolute(inputPath)) {
        throw new Error('Tool paths must be relative to the selected repository.')
      }

      const candidate = path.resolve(root, inputPath)
      const candidateRelative = path.relative(root, candidate)
      if (candidateRelative.startsWith('..') || path.isAbsolute(candidateRelative)) {
        throw new Error('Tool path escapes the selected repository.')
      }
      assertRelativeAllowed(candidateRelative || '.')

      const realPath = realpathSync(candidate)
      const relativePath = assertContained(realPath)
      assertRelativeAllowed(relativePath || '.')
      return realPath
    },
    assertPattern(pattern: string): void {
      if (path.isAbsolute(pattern)) {
        throw new Error('Glob patterns must be relative to the selected repository.')
      }

      const segments = pattern.split(/[\\/]+/).filter(Boolean)
      if (segments.includes('..')) {
        throw new Error('Glob pattern escapes the selected repository.')
      }
      assertRelativeAllowed(pattern)
    },
    assertResolvedPath(resolvedPath: string): string {
      const realPath = realpathSync(resolvedPath)
      const relativePath = assertContained(realPath)
      assertRelativeAllowed(relativePath || '.')
      return relativePath
    }
  }
}
