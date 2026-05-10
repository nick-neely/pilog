import { describe, it, expect, beforeEach } from 'vitest'
import { createInMemoryDatabase, type PilogDatabase } from '../client'
import { runMigrations } from '../migrations'
import { DEFAULT_ONBOARDING_STATE, completeOnboardingState } from '@shared/onboarding'
import { getOnboardingState, getSetting, setOnboardingState, setSetting } from './settings'

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

  it('stores different keys independently', () => {
    setSetting(db, 'hotkey.scratchpad', 'CmdOrCtrl+Shift+N')
    setSetting(db, 'openInboxAtLogin', 'true')

    expect(getSetting(db, 'hotkey.scratchpad')).toBe('CmdOrCtrl+Shift+N')
    expect(getSetting(db, 'openInboxAtLogin')).toBe('true')
  })

  it('stores onboarding completion state in the settings table', () => {
    expect(getOnboardingState(db)).toEqual(DEFAULT_ONBOARDING_STATE)

    const completed = completeOnboardingState(DEFAULT_ONBOARDING_STATE, '2026-05-10T12:00:00.000Z')
    setOnboardingState(db, completed)

    expect(getOnboardingState(db)).toEqual(completed)
    expect(getSetting(db, 'onboarding.state')).toContain('"completed":true')
  })
})
