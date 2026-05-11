import { describe, expect, it } from 'vitest'
import { SHORTCUT_CONTRACT } from '@shared/shortcuts'
import {
  PILOG_APP_SHORTCUTS,
  hasOpenTransientUi,
  isEditableShortcutTarget,
  shortcutBindingMeta,
  shortcutBindingToTanStackHotkey,
  shouldClearSelectionForContextualEscape,
  shouldEnableGenerateDraftsShortcut,
  shouldEnablePublishDraftShortcut
} from './pilog-hotkeys'

class FakeHTMLElement extends EventTarget {
  constructor(private readonly matched: boolean) {
    super()
  }

  closest(): FakeHTMLElement | null {
    return this.matched ? this : null
  }
}

function withFakeHTMLElement(callback: () => void): void {
  const originalHTMLElement = globalThis.HTMLElement

  Object.defineProperty(globalThis, 'HTMLElement', {
    configurable: true,
    value: FakeHTMLElement
  })

  try {
    callback()
  } finally {
    Object.defineProperty(globalThis, 'HTMLElement', {
      configurable: true,
      value: originalHTMLElement
    })
  }
}

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
    withFakeHTMLElement(() => {
      expect(isEditableShortcutTarget(new FakeHTMLElement(true))).toBe(true)
      expect(isEditableShortcutTarget(new FakeHTMLElement(false))).toBe(false)
      expect(isEditableShortcutTarget(new EventTarget())).toBe(false)
    })
  })

  it('enables the generate shortcut only when the visible generate action is enabled', () => {
    expect(shouldEnableGenerateDraftsShortcut({ canGenerateDrafts: true })).toBe(true)
    expect(shouldEnableGenerateDraftsShortcut({ canGenerateDrafts: false })).toBe(false)
  })

  it('enables the publish shortcut only when the visible publish action is enabled', () => {
    expect(
      shouldEnablePublishDraftShortcut({ canPublish: true, publishing: false, saving: false })
    ).toBe(true)
    expect(
      shouldEnablePublishDraftShortcut({ canPublish: false, publishing: false, saving: false })
    ).toBe(false)
    expect(
      shouldEnablePublishDraftShortcut({ canPublish: true, publishing: true, saving: false })
    ).toBe(false)
    expect(
      shouldEnablePublishDraftShortcut({ canPublish: true, publishing: false, saving: true })
    ).toBe(false)
  })

  it('prioritizes transient UI and editable surfaces before contextual selection clearing', () => {
    withFakeHTMLElement(() => {
      expect(
        shouldClearSelectionForContextualEscape({
          selectionCount: 1,
          target: new FakeHTMLElement(false),
          transientUiOpen: false
        })
      ).toBe(true)
      expect(
        shouldClearSelectionForContextualEscape({
          selectionCount: 1,
          target: new FakeHTMLElement(false),
          transientUiOpen: true
        })
      ).toBe(false)
      expect(
        shouldClearSelectionForContextualEscape({
          selectionCount: 1,
          target: new FakeHTMLElement(true),
          transientUiOpen: false
        })
      ).toBe(false)
      expect(
        shouldClearSelectionForContextualEscape({
          selectionCount: 0,
          target: new FakeHTMLElement(false),
          transientUiOpen: false
        })
      ).toBe(false)
    })
  })

  it('detects open transient UI surfaces', () => {
    const root = {
      querySelector(selector: string): object | null {
        expect(selector).toContain('[role="dialog"][data-state="open"]')
        expect(selector).toContain('[data-slot="select-content"][data-state="open"]')
        return {}
      }
    } as ParentNode

    expect(hasOpenTransientUi(root)).toBe(true)
  })
})
