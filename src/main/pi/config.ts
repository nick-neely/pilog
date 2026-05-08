import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PilogDatabase } from '../db/client'
import { deleteSetting, getSetting, setSetting } from '../db/repositories/settings'
import {
  clearSafeStorageAuthStorage,
  createModelRegistry,
  createSafeStorageAuthStorage,
  importAuthJsonIntoSafeStorage
} from './auth-storage'
import type { PiActiveConfig, PiAuthMethod, PiModelOption, PiProviderOption } from '@shared/types'

const EXISTING_PI_AUTH_PATH = join(homedir(), '.pi', 'agent', 'auth.json')

export async function getActivePiConfig(db: PilogDatabase): Promise<PiActiveConfig> {
  const provider = getSetting(db, 'pi.activeProvider')
  const modelId = getSetting(db, 'pi.activeModel')
  const authStorage = await createSafeStorageAuthStorage()
  const registry = await createModelRegistry(authStorage)
  const credential = provider ? authStorage.get(provider) : undefined
  const model = provider && modelId ? registry.find(provider, modelId) : undefined
  const providerKnown = provider ? registry.getAll().some((m) => m.provider === provider) : false
  const authMethod = getAuthMethod(credential)
  const hasApiKey = credential?.type === 'api_key' && credential.key.length > 0

  return {
    provider,
    providerName: provider ? registry.getProviderDisplayName(provider) : null,
    modelId,
    modelName: model?.name ?? modelId,
    hasApiKey,
    authMethod,
    valid: Boolean(provider && modelId && model && (hasApiKey || authMethod === 'oauth')),
    reason: getConfigReason({
      provider,
      modelId,
      providerKnown,
      modelKnown: Boolean(model),
      authMethod
    })
  }
}

export async function setActivePiConfig(
  db: PilogDatabase,
  input: { provider: string; modelId: string; apiKey?: string }
): Promise<PiActiveConfig> {
  const registry = await createModelRegistry()
  if (!registry.find(input.provider, input.modelId)) {
    throw new Error('Selected provider/model is not in Pi model registry.')
  }

  setSetting(db, 'pi.activeProvider', input.provider)
  setSetting(db, 'pi.activeModel', input.modelId)

  const apiKey = input.apiKey?.trim()
  if (apiKey) {
    const authStorage = await createSafeStorageAuthStorage()
    authStorage.set(input.provider, {
      type: 'api_key',
      key: apiKey
    })
  }

  return getActivePiConfig(db)
}

export async function listPiProviders(): Promise<PiProviderOption[]> {
  const authStorage = await createSafeStorageAuthStorage()
  const registry = await createModelRegistry(authStorage)
  const modelCountByProvider = new Map<string, number>()

  for (const model of registry.getAll()) {
    modelCountByProvider.set(model.provider, (modelCountByProvider.get(model.provider) ?? 0) + 1)
  }

  return [...modelCountByProvider.entries()]
    .map(([provider, modelCount]) => {
      const credential = authStorage.get(provider)
      return {
        id: provider,
        name: registry.getProviderDisplayName(provider),
        modelCount,
        hasCredential: authStorage.hasAuth(provider),
        authMethod: getAuthMethod(credential)
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listPiModels(provider?: string): Promise<PiModelOption[]> {
  return (await createModelRegistry())
    .getAll()
    .filter((model) => !provider || model.provider === provider)
    .map((model) => ({ id: model.id, name: model.name ?? model.id, provider: model.provider }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function importExistingPiConfig(db: PilogDatabase): Promise<PiActiveConfig> {
  const importedProviders = await importAuthJsonIntoSafeStorage(EXISTING_PI_AUTH_PATH)
  const active = await getActivePiConfig(db)

  if (!active.provider && importedProviders.length > 0) {
    const provider = importedProviders[0]
    const model = (await listPiModels(provider))[0]
    if (model) {
      setSetting(db, 'pi.activeProvider', provider)
      setSetting(db, 'pi.activeModel', model.id)
    }
  }

  return getActivePiConfig(db)
}

export async function resetPiConfig(db: PilogDatabase): Promise<PiActiveConfig> {
  clearSafeStorageAuthStorage()
  deleteSetting(db, 'pi.activeProvider')
  deleteSetting(db, 'pi.activeModel')
  return getActivePiConfig(db)
}

function getAuthMethod(credential: unknown): PiAuthMethod | null {
  if (!credential || typeof credential !== 'object') return null
  const authMethod = (credential as { type?: unknown }).type
  return authMethod === 'api_key' || authMethod === 'oauth' ? authMethod : null
}

function getConfigReason(input: {
  provider: string | null
  modelId: string | null
  providerKnown: boolean
  modelKnown: boolean
  authMethod: PiAuthMethod | null
}): PiActiveConfig['reason'] {
  if (!input.provider) return 'missing-provider'
  if (!input.providerKnown) return 'unknown-provider'
  if (!input.modelId) return 'missing-model'
  if (!input.modelKnown) return 'unknown-model'
  if (!input.authMethod) return 'missing-credential'
  return undefined
}
