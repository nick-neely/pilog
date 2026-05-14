import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { RepoIndexDirectory, RepoIndexExclusionSummary } from '@shared/ipc'

export const REPO_INDEX_VERSION = 1

export type RepoIndexSnapshot = {
  indexVersion: number
  lastIndexedAt: string
  packageManager: string | null
  frameworkSignals: string[]
  importantDirectories: RepoIndexDirectory[]
  exclusionSummary: RepoIndexExclusionSummary
}

type Entry = {
  name: string
  relativePath: string
  isDirectory: boolean
}

const IMPORTANT_DIRECTORY_ROLES = new Map<string, string>([
  ['src', 'Source'],
  ['app', 'App routes'],
  ['pages', 'Pages'],
  ['components', 'Components'],
  ['api', 'API routes'],
  ['server', 'Server'],
  ['tests', 'Tests'],
  ['test', 'Tests'],
  ['__tests__', 'Tests'],
  ['docs', 'Documentation'],
  ['scripts', 'Scripts']
])

export async function createRepoIndexSnapshot(localPath: string): Promise<RepoIndexSnapshot> {
  const entries = await readTopLevelEntries(localPath)
  const names = new Set(entries.map((entry) => entry.name))
  const packageJson = await readPackageJson(localPath)

  return {
    indexVersion: REPO_INDEX_VERSION,
    lastIndexedAt: new Date().toISOString(),
    packageManager: detectPackageManager(names),
    frameworkSignals: detectFrameworkSignals(names, packageJson),
    importantDirectories: detectImportantDirectories(entries),
    exclusionSummary: summarizeExclusions(entries)
  }
}

async function readTopLevelEntries(localPath: string): Promise<Entry[]> {
  const dirents = await readdir(localPath, { withFileTypes: true })
  return Promise.all(
    dirents.map(async (dirent) => {
      const absolutePath = path.join(localPath, dirent.name)
      const entryStat = await stat(absolutePath)
      return {
        name: dirent.name,
        relativePath: dirent.name,
        isDirectory: dirent.isDirectory() || entryStat.isDirectory()
      }
    })
  )
}

async function readPackageJson(localPath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path.join(localPath, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function detectPackageManager(names: Set<string>): string | null {
  if (names.has('pnpm-lock.yaml')) return 'pnpm'
  if (names.has('yarn.lock')) return 'yarn'
  if (names.has('package-lock.json')) return 'npm'
  if (names.has('bun.lockb') || names.has('bun.lock')) return 'bun'
  if (names.has('uv.lock')) return 'uv'
  if (names.has('poetry.lock')) return 'poetry'
  if (names.has('Cargo.lock')) return 'cargo'
  return null
}

function detectFrameworkSignals(
  names: Set<string>,
  packageJson: Record<string, unknown> | null
): string[] {
  const dependencies = packageJson ? collectPackageDependencies(packageJson) : new Set<string>()
  const signals = new Set<string>()

  if (names.has('next.config.js') || names.has('next.config.mjs') || dependencies.has('next')) {
    signals.add('Next.js')
  }
  if (names.has('vite.config.ts') || names.has('vite.config.js') || dependencies.has('vite')) {
    signals.add('Vite')
  }
  if (dependencies.has('react')) signals.add('React')
  if (dependencies.has('electron')) signals.add('Electron')
  if (dependencies.has('@sveltejs/kit')) signals.add('SvelteKit')
  if (dependencies.has('vue')) signals.add('Vue')
  if (names.has('Cargo.toml')) signals.add('Rust')
  if (names.has('pyproject.toml')) signals.add('Python')

  return Array.from(signals).sort()
}

function collectPackageDependencies(packageJson: Record<string, unknown>): Set<string> {
  const dependencies = new Set<string>()
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    const value = packageJson[field]
    if (!value || typeof value !== 'object') continue
    Object.keys(value).forEach((name) => dependencies.add(name))
  }
  return dependencies
}

function detectImportantDirectories(entries: Entry[]): RepoIndexDirectory[] {
  return entries
    .filter((entry) => entry.isDirectory)
    .flatMap((entry) => {
      const role = IMPORTANT_DIRECTORY_ROLES.get(entry.name)
      return role ? [{ path: entry.relativePath, role }] : []
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

function summarizeExclusions(entries: Entry[]): RepoIndexExclusionSummary {
  const summary = { dependency: 0, buildOutput: 0, generated: 0, binaryHeavy: 0, ignored: 0 }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'vendor') summary.dependency += 1
    if (['dist', 'build', 'out', '.next', 'coverage'].includes(entry.name)) summary.buildOutput += 1
    if (['generated', '.turbo', '.cache'].includes(entry.name)) summary.generated += 1
    if (['assets', 'public'].includes(entry.name)) summary.binaryHeavy += 1
    if (entry.name === '.git' || entry.name === '.gitignore') summary.ignored += 1
  }
  return summary
}
