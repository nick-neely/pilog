import { describe, expect, it } from 'vitest'
import { SHORTCUT_CONTRACT } from '@shared/shortcuts'
import {
  PILOG_APP_SHORTCUTS,
  isEditableShortcutTarget,
  shortcutBindingMeta,
  shortcutBindingToTanStackHotkey
} from './pilog-hotkeys'

describe('PiLog renderer hotkeys', () => {
  it('converts canonical accelerators to TanStack Mod bindings', () => {
    expect(shortcutBindingToTanStackHotkey(SHORTCUT_CONTRACT.openInbox)).toBe('Mod+1')
    expect(shortcutBindingToTanStackHotkey(SHORTCUT_CONTRACT.publishDraft)).toBe('Mod+Enter')
  })

  it('converts canonical sequences for TanStack registration', () => {
    expect(shortcutBindingToTanStackHotkey(SHORTCUT_CONTRACT.generateDrafts)).toBe('G D')
  })

  it('generates platform-aware metadata from the shortcut contract', () => {
    expect(shortcutBindingMeta(SHORTCUT_CONTRACT.openDrafts, 'mac')).toEqual({
      name: 'Open Drafts',
      description: '⌘ + 2',
      pilogShortcutId: 'route.drafts'
    })
  })

  it('keeps app-local shortcuts in the same metadata path as canonical shortcuts', () => {
    expect(shortcutBindingToTanStackHotkey(PILOG_APP_SHORTCUTS.commandPalette)).toBe('Mod+K')
    expect(shortcutBindingMeta(PILOG_APP_SHORTCUTS.save, 'windows')).toMatchObject({
      name: 'Save changes',
      description: 'Ctrl + S'
    })
  })

  it('detects editable targets, including editor surfaces', () => {
    const OriginalHTMLElement = globalThis.HTMLElement

    class FakeHTMLElement extends EventTarget {
      constructor(private readonly matched: boolean) {
        super()
      }

      closest(): FakeHTMLElement | null {
        return this.matched ? this : null
      }
    }

    globalThis.HTMLElement = FakeHTMLElement as unknown as typeof HTMLElement

    try {
      expect(isEditableShortcutTarget(new FakeHTMLElement(true))).toBe(true)
      expect(isEditableShortcutTarget(new FakeHTMLElement(false))).toBe(false)
      expect(isEditableShortcutTarget(new EventTarget())).toBe(false)
    } finally {
      globalThis.HTMLElement = OriginalHTMLElement
    }
  })
})
