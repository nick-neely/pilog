import { globalShortcut } from 'electron'
import { DEFAULT_GLOBAL_CAPTURE_SHORTCUT } from '@shared/shortcuts'
import type { PilogDatabase } from '../db/client'
import { getSetting } from '../db/repositories/settings'

let registeredGlobalCaptureShortcut: string | null = null

export function registerGlobalHotkeys(db: PilogDatabase, openScratchpad: () => void): void {
  const customHotkey = getSetting(db, 'hotkey.scratchpad')
  const accelerator = customHotkey ?? DEFAULT_GLOBAL_CAPTURE_SHORTCUT

  if (registeredGlobalCaptureShortcut === accelerator && globalShortcut.isRegistered(accelerator)) {
    return
  }

  const previousAccelerator = registeredGlobalCaptureShortcut
  if (previousAccelerator !== null) {
    globalShortcut.unregister(previousAccelerator)
  }
  const registered = globalShortcut.register(accelerator, openScratchpad)
  if (!registered) {
    console.warn(`Failed to register global hotkey: ${accelerator}`)
    if (previousAccelerator !== null) {
      const restored = globalShortcut.register(previousAccelerator, openScratchpad)
      registeredGlobalCaptureShortcut = restored ? previousAccelerator : null
    }
    return
  }

  registeredGlobalCaptureShortcut = accelerator
}

export function unregisterGlobalHotkeys(): void {
  globalShortcut.unregisterAll()
  registeredGlobalCaptureShortcut = null
}
