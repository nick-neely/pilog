import { safeStorage, app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function getSecretsPath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function readSecrets(): Record<string, string> {
  const path = getSecretsPath()
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function writeSecrets(data: Record<string, string>): void {
  writeFileSync(getSecretsPath(), JSON.stringify(data))
}

export function getSecret(key: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  const data = readSecrets()
  const encoded = data[key]
  if (!encoded) return null
  return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
}

export function setSecret(key: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('safeStorage encryption unavailable — refusing to persist secret')
    return
  }
  const encrypted = safeStorage.encryptString(value)
  const data = readSecrets()
  data[key] = encrypted.toString('base64')
  writeSecrets(data)
}

export function deleteSecret(key: string): void {
  const data = readSecrets()
  delete data[key]
  writeSecrets(data)
}
