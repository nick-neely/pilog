import { globalShortcut } from 'electron'
import type { PilogDatabase } from '../db/client'
import { getSetting } from '../db/repositories/settings'

const DEFAULT_SCRATCHPAD_HOTKEY = 'CommandOrControl+Alt+N'

export function registerGlobalHotkeys(db: PilogDatabase, openScratchpad: () => void): void {
  const customHotkey = getSetting(db, 'hotkey.scratchpad')
  const accelerator = customHotkey ?? DEFAULT_SCRATCHPAD_HOTKEY

  const registered = globalShortcut.register(accelerator, openScratchpad)
  if (!registered) {
    console.warn(`Failed to register global hotkey: ${accelerator}`)
  }
}

export function unregisterGlobalHotkeys(): void {
  globalShortcut.unregisterAll()
}
