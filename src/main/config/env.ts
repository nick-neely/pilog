import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type MutableEnv = NodeJS.ProcessEnv

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return null

  const normalized = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed
  const separatorIndex = normalized.indexOf('=')
  if (separatorIndex <= 0) return null

  const key = normalized.slice(0, separatorIndex).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null

  let value = normalized.slice(separatorIndex + 1).trim()
  const quote = value[0]
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

export function loadDotEnvFile(
  filePath = resolve(process.cwd(), '.env'),
  env: MutableEnv = process.env
): void {
  if (!existsSync(filePath)) return

  const contents = readFileSync(filePath, 'utf8')
  for (const line of contents.split(/\r?\n/)) {
    const entry = parseEnvLine(line)
    if (!entry || env[entry.key] !== undefined) continue
    env[entry.key] = entry.value
  }
}
