import { app } from 'electron'
import { join } from 'node:path'
import type { AuthStorage } from '@earendil-works/pi-coding-agent'
import type { PilogDatabase } from '../db/client'
import { getSetting, setSetting } from '../db/repositories/settings'
import { createSafeStorageAuthStorage } from './auth-storage'
import {
  DEFAULT_TURN_BUDGET,
  MAX_TURN_BUDGET,
  MIN_TURN_BUDGET,
  isSearchProvider,
  type AdvancedSettings,
  type SearchProvider,
  type SetAdvancedSettingsRequest
} from '@shared/types'

const DEFAULT_SEARCH_PROVIDER: SearchProvider = 'brave'

const WEB_SEARCH_AUTH_NAMESPACE = 'web-search-auth'

export async function getAdvancedSettings(db: PilogDatabase): Promise<AdvancedSettings> {
  const webSearchProvider = parseSearchProvider(getSetting(db, 'pi.webSearchProvider'))

  return {
    turnBudget: getTurnBudget(db),
    webSearchEnabled: getSetting(db, 'pi.webSearchEnabled') === 'true',
    webSearchProvider,
    webSearchHasApiKey: (await getWebSearchAuthStorage()).hasAuth(webSearchProvider)
  }
}

export async function setAdvancedSettings(
  db: PilogDatabase,
  request: SetAdvancedSettingsRequest
): Promise<AdvancedSettings> {
  if (request.turnBudget !== undefined) {
    setSetting(db, 'pi.turnBudget', String(validateTurnBudget(request.turnBudget)))
  }

  if (request.webSearchEnabled !== undefined) {
    setSetting(db, 'pi.webSearchEnabled', request.webSearchEnabled ? 'true' : 'false')
  }

  if (request.webSearchProvider !== undefined) {
    setSetting(db, 'pi.webSearchProvider', validateSearchProvider(request.webSearchProvider))
  }

  const provider =
    request.webSearchProvider ?? parseSearchProvider(getSetting(db, 'pi.webSearchProvider'))
  const apiKey = request.webSearchApiKey?.trim()
  if (apiKey) {
    ;(await getWebSearchAuthStorage()).set(provider, { type: 'api_key', key: apiKey })
  }

  return getAdvancedSettings(db)
}

export function getTurnBudget(db: PilogDatabase): number {
  const parsed = Number(getSetting(db, 'pi.turnBudget'))
  return Number.isInteger(parsed) && parsed >= MIN_TURN_BUDGET && parsed <= MAX_TURN_BUDGET
    ? parsed
    : DEFAULT_TURN_BUDGET
}

export async function getWebSearchConfig(
  db: PilogDatabase
): Promise<{ enabled: false } | { enabled: true; provider: SearchProvider; apiKey: string }> {
  if (getSetting(db, 'pi.webSearchEnabled') !== 'true') return { enabled: false }

  const provider = parseSearchProvider(getSetting(db, 'pi.webSearchProvider'))
  const credential = (await getWebSearchAuthStorage()).get(provider)
  if (credential?.type !== 'api_key' || !credential.key.trim()) return { enabled: false }

  return { enabled: true, provider, apiKey: credential.key }
}

function validateTurnBudget(value: number): number {
  if (!Number.isInteger(value) || value < MIN_TURN_BUDGET || value > MAX_TURN_BUDGET) {
    throw new Error('Turn Budget must be an integer from 1 to 100.')
  }

  return value
}

function parseSearchProvider(value: string | null): SearchProvider {
  return isSearchProvider(value) ? value : DEFAULT_SEARCH_PROVIDER
}

function validateSearchProvider(value: unknown): SearchProvider {
  if (!isSearchProvider(value)) throw new Error('Unsupported search provider.')
  return value
}

function getWebSearchAuthStorage(): Promise<AuthStorage> {
  return createSafeStorageAuthStorage(join(app.getPath('userData'), WEB_SEARCH_AUTH_NAMESPACE))
}
