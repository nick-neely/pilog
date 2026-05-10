import { eq } from 'drizzle-orm'
import type { PilogDatabase } from '../client'
import { settings } from '../schema'
import type { SettingKey } from '@shared/ipc'
import {
  parseOnboardingState,
  serializeOnboardingState,
  type OnboardingState
} from '@shared/onboarding'

export function getSetting(db: PilogDatabase, key: SettingKey): string | null {
  const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get()
  return row?.value ?? null
}

export function setSetting(db: PilogDatabase, key: SettingKey, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } })
    .run()
}

export function deleteSetting(db: PilogDatabase, key: SettingKey): void {
  db.delete(settings).where(eq(settings.key, key)).run()
}

export function getOnboardingState(db: PilogDatabase): OnboardingState {
  return parseOnboardingState(getSetting(db, 'onboarding.state'))
}

export function setOnboardingState(db: PilogDatabase, state: OnboardingState): OnboardingState {
  setSetting(db, 'onboarding.state', serializeOnboardingState(state))
  return state
}
