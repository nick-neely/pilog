import { eq } from 'drizzle-orm'
import type { PilogDatabase } from '../client'
import { settings } from '../schema'
import type { SettingKey } from '@shared/ipc'

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
