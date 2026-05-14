import { eq } from 'drizzle-orm'
import type { PilogDatabase } from '../client'
import { repoIndices } from '../schema'
import type { RepoIndexDirectory, RepoIndexExclusionSummary, RepoIndexStatus } from '@shared/ipc'

const EMPTY_EXCLUSION_SUMMARY: RepoIndexExclusionSummary = {
  dependency: 0,
  buildOutput: 0,
  generated: 0,
  binaryHeavy: 0,
  ignored: 0
}

type RepoIndexRow = {
  repoId: string
  status: 'ready' | 'failed'
  indexVersion: number
  lastIndexedAt: string | null
  packageManager: string | null
  frameworkSignals: string
  importantDirectories: string
  exclusionSummary: string
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

type UpsertRepoIndexInput =
  | {
      status: 'ready'
      indexVersion: number
      lastIndexedAt: string
      packageManager: string | null
      frameworkSignals: string[]
      importantDirectories: RepoIndexDirectory[]
      exclusionSummary: RepoIndexExclusionSummary
    }
  | {
      status: 'failed'
      indexVersion: number
      errorMessage: string
    }

export function upsertRepoIndex(
  db: PilogDatabase,
  repoId: string,
  input: UpsertRepoIndexInput
): RepoIndexStatus {
  const now = new Date().toISOString()
  const existing = getRepoIndex(db, repoId)
  const values = buildRepoIndexValues(repoId, input, now)

  if (existing) {
    db.update(repoIndices)
      .set({
        status: values.status,
        indexVersion: values.indexVersion,
        lastIndexedAt: values.lastIndexedAt,
        packageManager: values.packageManager,
        frameworkSignals: values.frameworkSignals,
        importantDirectories: values.importantDirectories,
        exclusionSummary: values.exclusionSummary,
        errorMessage: values.errorMessage,
        updatedAt: now
      })
      .where(eq(repoIndices.repoId, repoId))
      .run()
  } else {
    db.insert(repoIndices).values(values).run()
  }

  const saved = getRepoIndex(db, repoId)
  if (!saved) throw new Error('Repo Index could not be saved.')
  return saved
}

function buildRepoIndexValues(
  repoId: string,
  input: UpsertRepoIndexInput,
  now: string
): typeof repoIndices.$inferInsert {
  if (input.status === 'failed') {
    return {
      repoId,
      status: input.status,
      indexVersion: input.indexVersion,
      lastIndexedAt: null,
      packageManager: null,
      frameworkSignals: JSON.stringify([]),
      importantDirectories: JSON.stringify([]),
      exclusionSummary: JSON.stringify(EMPTY_EXCLUSION_SUMMARY),
      errorMessage: input.errorMessage,
      createdAt: now,
      updatedAt: now
    }
  }

  return {
    repoId,
    status: input.status,
    indexVersion: input.indexVersion,
    lastIndexedAt: input.lastIndexedAt,
    packageManager: input.packageManager,
    frameworkSignals: JSON.stringify(input.frameworkSignals),
    importantDirectories: JSON.stringify(input.importantDirectories),
    exclusionSummary: JSON.stringify(input.exclusionSummary),
    errorMessage: null,
    createdAt: now,
    updatedAt: now
  }
}

export function getRepoIndex(db: PilogDatabase, repoId: string): RepoIndexStatus | null {
  const row = db.select().from(repoIndices).where(eq(repoIndices.repoId, repoId)).get()
  return row ? mapRepoIndexRow(row as RepoIndexRow) : null
}

export function listRepoIndices(db: PilogDatabase): Map<string, RepoIndexStatus> {
  const rows = db.select().from(repoIndices).all() as RepoIndexRow[]
  return new Map(rows.map((row) => [row.repoId, mapRepoIndexRow(row)]))
}

function mapRepoIndexRow(row: RepoIndexRow): RepoIndexStatus {
  const frameworkSignals = parseStringArray(row.frameworkSignals)
  const importantDirectories = parseDirectories(row.importantDirectories)
  const exclusionSummary = parseExclusionSummary(row.exclusionSummary)

  if (row.status === 'failed') {
    return {
      status: 'failed',
      lastIndexedAt: row.lastIndexedAt,
      indexVersion: row.indexVersion,
      packageManager: null,
      frameworkSignals,
      importantDirectories,
      exclusionSummary,
      errorMessage: row.errorMessage ?? 'Repo Index creation failed.'
    }
  }

  return {
    status: 'ready',
    lastIndexedAt: row.lastIndexedAt ?? row.updatedAt,
    indexVersion: row.indexVersion,
    packageManager: row.packageManager,
    frameworkSignals,
    importantDirectories,
    exclusionSummary,
    errorMessage: null
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function parseDirectories(value: string): RepoIndexDirectory[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const directory = item as Partial<RepoIndexDirectory>
      if (typeof directory.path !== 'string' || typeof directory.role !== 'string') return []
      return [{ path: directory.path, role: directory.role }]
    })
  } catch {
    return []
  }
}

function parseExclusionSummary(value: string): RepoIndexExclusionSummary {
  try {
    const parsed = JSON.parse(value) as Partial<RepoIndexExclusionSummary>
    return {
      dependency: numberOrZero(parsed.dependency),
      buildOutput: numberOrZero(parsed.buildOutput),
      generated: numberOrZero(parsed.generated),
      binaryHeavy: numberOrZero(parsed.binaryHeavy),
      ignored: numberOrZero(parsed.ignored)
    }
  } catch {
    return EMPTY_EXCLUSION_SUMMARY
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
