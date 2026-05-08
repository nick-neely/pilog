import { safeStorage, app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let warnedAboutDevFallback = false

function getSecretsPath(): string {
  return join(app.getPath('userData'), 'secrets.json')
}

function getDevSecretsPath(): string {
  return join(app.getPath('userData'), 'secrets.dev.json')
}

function readSecrets(): Record<string, string> {
  const path = getSecretsPath()
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function readDevSecrets(): Record<string, string> {
  const path = getDevSecretsPath()
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function writeSecrets(data: Record<string, string>): void {
  writeFileSync(getSecretsPath(), JSON.stringify(data))
}

function writeDevSecrets(data: Record<string, string>): void {
  writeFileSync(getDevSecretsPath(), JSON.stringify(data))
}

function canUseInsecureDevFallback(): boolean {
  return !app.isPackaged
}

function warnAboutDevFallback(): void {
  if (warnedAboutDevFallback) return
  warnedAboutDevFallback = true
  console.warn(
    'safeStorage encryption unavailable — using plaintext dev-only secret storage in Electron userData'
  )
}

export function getSecret(key: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    if (!canUseInsecureDevFallback()) return null
    warnAboutDevFallback()
    return readDevSecrets()[key] ?? null
  }
  const data = readSecrets()
  const encoded = data[key]
  if (!encoded) return null
  return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
}

export function setSecret(key: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    if (!canUseInsecureDevFallback()) {
      console.warn('safeStorage encryption unavailable — refusing to persist secret')
      return
    }
    warnAboutDevFallback()
    const data = readDevSecrets()
    data[key] = value
    writeDevSecrets(data)
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

  if (canUseInsecureDevFallback()) {
    const devData = readDevSecrets()
    delete devData[key]
    writeDevSecrets(devData)
  }
}
