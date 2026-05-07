import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { getSetting, setSetting } from './settings'

describe('settings repository', () => {
  let db: PilogDatabase

  beforeEach(() => {
    db = createInMemoryDatabase()
    runMigrations(db)
  })

  it('returns null for a key that does not exist', () => {
    const value = getSetting(db, 'hotkey.scratchpad')
    expect(value).toBeNull()
  })

  it('sets and retrieves a value', () => {
    setSetting(db, 'hotkey.scratchpad', 'CmdOrCtrl+Shift+N')

    const value = getSetting(db, 'hotkey.scratchpad')
    expect(value).toBe('CmdOrCtrl+Shift+N')
  })

  it('overwrites an existing value', () => {
    setSetting(db, 'hotkey.scratchpad', 'CmdOrCtrl+Shift+N')
    setSetting(db, 'hotkey.scratchpad', 'CmdOrCtrl+Alt+M')

    const value = getSetting(db, 'hotkey.scratchpad')
    expect(value).toBe('CmdOrCtrl+Alt+M')
  })
})
