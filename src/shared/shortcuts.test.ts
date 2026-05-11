import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GLOBAL_CAPTURE_SHORTCUT,
  SHORTCUT_CONTRACT,
  acceleratorFromKeyEvent,
  formatShortcutForDisplay,
  getShortcutDisplayPlatform
} from './shortcuts'

describe('shortcut contract', () => {
  it('defines the canonical global capture default', () => {
    expect(DEFAULT_GLOBAL_CAPTURE_SHORTCUT).toBe('CommandOrControl+Shift+Space')
    expect(SHORTCUT_CONTRACT.globalCapture.accelerator).toBe(DEFAULT_GLOBAL_CAPTURE_SHORTCUT)
  })

  it('defines the keyboard-first workspace contract', () => {
    expect(SHORTCUT_CONTRACT.openInbox.accelerator).toBe('CommandOrControl+1')
    expect(SHORTCUT_CONTRACT.openDrafts.accelerator).toBe('CommandOrControl+2')
    expect(SHORTCUT_CONTRACT.generateDrafts.sequence).toEqual(['G', 'D'])
    expect(SHORTCUT_CONTRACT.publishDraft.accelerator).toBe('CommandOrControl+Enter')
    expect(SHORTCUT_CONTRACT.listNext.key).toBe('J')
    expect(SHORTCUT_CONTRACT.listPrevious.key).toBe('K')
    expect(SHORTCUT_CONTRACT.contextualEscape.key).toBe('Esc')
  })

  it('keeps Run History command-palette-only for route switching', () => {
    expect(
      Object.values(SHORTCUT_CONTRACT).some((binding) => String(binding.id) === 'route.runs')
    ).toBe(false)
    expect(
      Object.values(SHORTCUT_CONTRACT).some(
        (binding) =>
          'accelerator' in binding && String(binding.accelerator) === 'CommandOrControl+3'
      )
    ).toBe(false)
  })

  it('formats accelerators for Mac display', () => {
    expect(formatShortcutForDisplay('CommandOrControl+Shift+Space', 'mac')).toBe(
      '⌘ + Shift + Space'
    )
    expect(formatShortcutForDisplay('CommandOrControl+Enter', 'mac')).toBe('⌘ + Enter')
  })

  it('formats accelerators for Windows and Linux display', () => {
    expect(formatShortcutForDisplay('CommandOrControl+Shift+Space', 'windows')).toBe(
      'Ctrl + Shift + Space'
    )
    expect(formatShortcutForDisplay('CmdOrCtrl+1', 'linux')).toBe('Ctrl + 1')
  })

  it('formats sequences and single keys without accelerator separators', () => {
    expect(formatShortcutForDisplay(SHORTCUT_CONTRACT.generateDrafts.sequence, 'mac')).toBe('G D')
    expect(formatShortcutForDisplay(SHORTCUT_CONTRACT.contextualEscape.key, 'windows')).toBe('Esc')
  })

  it('detects display platforms from navigator platform strings', () => {
    expect(getShortcutDisplayPlatform('MacIntel')).toBe('mac')
    expect(getShortcutDisplayPlatform('Win32')).toBe('windows')
    expect(getShortcutDisplayPlatform('Linux x86_64')).toBe('linux')
  })

  it('captures an Electron accelerator from a key event', () => {
    expect(
      acceleratorFromKeyEvent(
        { key: ' ', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        'linux'
      )
    ).toBe('CommandOrControl+Shift+Space')
  })

  it('keeps Control distinct from Command on Mac', () => {
    expect(
      acceleratorFromKeyEvent(
        { key: ' ', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        'mac'
      )
    ).toBe('Control+Shift+Space')
    expect(
      acceleratorFromKeyEvent(
        { key: ' ', ctrlKey: false, metaKey: true, altKey: false, shiftKey: true },
        'mac'
      )
    ).toBe('CommandOrControl+Shift+Space')
  })

  it('waits for a non-modifier key before capturing an accelerator', () => {
    expect(
      acceleratorFromKeyEvent(
        { key: 'Shift', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        'windows'
      )
    ).toBeNull()
  })
})
