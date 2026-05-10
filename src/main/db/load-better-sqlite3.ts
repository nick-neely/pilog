import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'

type BetterSqlite3Constructor = typeof BetterSqlite3
type BetterSqlite3RequireResult = BetterSqlite3Constructor | { default: BetterSqlite3Constructor }

const sourceRequire = createRequire(__filename)

function isDefaultExport(
  result: BetterSqlite3RequireResult
): result is { default: BetterSqlite3Constructor } {
  return typeof result === 'object' && result !== null && 'default' in result
}

export function loadBetterSqlite3(): BetterSqlite3Constructor {
  const runtimeRequire = createRuntimeRequire()
  const result = runtimeRequire('better-sqlite3') as BetterSqlite3RequireResult
  return isDefaultExport(result) ? result.default : result
}

function createRuntimeRequire(): NodeJS.Require {
  if (!process.versions.electron) {
    return sourceRequire
  }

  const devRuntimePackage = resolve(process.cwd(), 'app/package.json')

  if (process.defaultApp === true && existsSync(devRuntimePackage)) {
    return createRequire(devRuntimePackage)
  }

  return sourceRequire
}
