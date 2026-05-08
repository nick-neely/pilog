import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInMemoryDatabase, type PilogDatabase } from '../db/client'
import { runMigrations } from '../db/migrations'
import { getSetting } from '../db/repositories/settings'
import { settings } from '../db/schema'

let userDataDir: string

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`encrypted:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().replace(/^encrypted:/, '')
  },
  app: {
    getPath: vi.fn(() => userDataDir)
  }
}))

describe('Pi config', () => {
  let db: PilogDatabase

  beforeEach(() => {
    userDataDir = join(tmpdir(), `pilog-pi-config-test-${Date.now()}-${Math.random()}`)
    mkdirSync(userDataDir, { recursive: true })
    db = createInMemoryDatabase()
    runMigrations(db)
  })

  it('persists active provider/model in settings and credentials in safeStorage', async () => {
    const { createSafeStorageAuthStorage } = await import('./auth-storage')
    const { listPiModels, setActivePiConfig, getActivePiConfig } = await import('./config')
    const model = (await listPiModels())[0]
    expect(model).toBeDefined()

    const active = await setActivePiConfig(db, {
      provider: model!.provider,
      modelId: model!.id,
      apiKey: 'sk-test-secret'
    })

    expect(active.valid).toBe(true)
    expect(getSetting(db, 'pi.activeProvider')).toBe(model!.provider)
    expect(getSetting(db, 'pi.activeModel')).toBe(model!.id)
    expect((await createSafeStorageAuthStorage()).get(model!.provider)).toEqual({
      type: 'api_key',
      key: 'sk-test-secret'
    })

    const rows = db.select().from(settings).all()
    expect(JSON.stringify(rows)).not.toContain('sk-test-secret')
    await expect(getActivePiConfig(db)).resolves.toMatchObject({
      provider: model!.provider,
      modelId: model!.id,
      hasApiKey: true,
      authMethod: 'api_key',
      valid: true
    })
  })

  it('reset clears active settings and safeStorage credentials', async () => {
    const { createSafeStorageAuthStorage } = await import('./auth-storage')
    const { listPiModels, resetPiConfig, setActivePiConfig } = await import('./config')
    const model = (await listPiModels())[0]!
    await setActivePiConfig(db, {
      provider: model.provider,
      modelId: model.id,
      apiKey: 'sk-test-secret'
    })

    const active = await resetPiConfig(db)

    expect(active.valid).toBe(false)
    expect(getSetting(db, 'pi.activeProvider')).toBeNull()
    expect(getSetting(db, 'pi.activeModel')).toBeNull()
    expect((await createSafeStorageAuthStorage()).hasAuth(model.provider)).toBe(false)
  })

  it('round-trips advanced settings and keeps web search keys out of SQLite', async () => {
    const { getAdvancedSettings, setAdvancedSettings } = await import('./advanced-config')

    await expect(getAdvancedSettings(db)).resolves.toMatchObject({
      turnBudget: 20,
      webSearchEnabled: false,
      webSearchProvider: 'brave',
      webSearchHasApiKey: false
    })

    const saved = await setAdvancedSettings(db, {
      turnBudget: 5,
      webSearchEnabled: true,
      webSearchProvider: 'tavily',
      webSearchApiKey: 'tvly-test-secret'
    })

    expect(saved).toMatchObject({
      turnBudget: 5,
      webSearchEnabled: true,
      webSearchProvider: 'tavily',
      webSearchHasApiKey: true
    })
    expect(await getAdvancedSettings(db)).toEqual(saved)
    expect(JSON.stringify(db.select().from(settings).all())).not.toContain('tvly-test-secret')
  })

  it('rejects invalid advanced turn budgets before saving', async () => {
    const { getAdvancedSettings, setAdvancedSettings } = await import('./advanced-config')

    await expect(setAdvancedSettings(db, { turnBudget: 0 })).rejects.toThrow(
      'Turn Budget must be an integer from 1 to 100.'
    )
    await expect(setAdvancedSettings(db, { turnBudget: 101 })).rejects.toThrow(
      'Turn Budget must be an integer from 1 to 100.'
    )

    await expect(getAdvancedSettings(db)).resolves.toMatchObject({ turnBudget: 20 })
  })
})
