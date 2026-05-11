import { globalShortcut } from 'electron'
import { DEFAULT_GLOBAL_CAPTURE_SHORTCUT } from '@shared/shortcuts'
import type { PilogDatabase } from '../db/client'
import { getSetting } from '../db/repositories/settings'

export function registerGlobalHotkeys(db: PilogDatabase, openScratchpad: () => void): void {
  const customHotkey = getSetting(db, 'hotkey.scratchpad')
  const accelerator = customHotkey ?? DEFAULT_GLOBAL_CAPTURE_SHORTCUT

  const registered = globalShortcut.register(accelerator, openScratchpad)
  if (!registered) {
    console.warn(`Failed to register global hotkey: ${accelerator}`)
  }
}

export function unregisterGlobalHotkeys(): void {
  globalShortcut.unregisterAll()
}
