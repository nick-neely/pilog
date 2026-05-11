import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHORTCUT_CONTRACT } from './shortcuts'

describe('/site shortcut section parity', () => {
  it('advertises the same keyboard-first contract as the Electron app', () => {
    const keyboardSection = readFileSync(
      resolve(process.cwd(), 'site/src/components/landing/keyboard.tsx'),
      'utf8'
    )

    expect(keyboardSection).toContain("['⌘/Ctrl', '⇧', 'Space']")
    expect(SHORTCUT_CONTRACT.globalCapture.accelerator).toBe('CommandOrControl+Shift+Space')

    expect(keyboardSection).toContain("['⌘/Ctrl', '1']")
    expect(SHORTCUT_CONTRACT.openInbox.accelerator).toBe('CommandOrControl+1')

    expect(keyboardSection).toContain("['⌘/Ctrl', '2']")
    expect(SHORTCUT_CONTRACT.openDrafts.accelerator).toBe('CommandOrControl+2')

    expect(keyboardSection).toContain("['G', 'D']")
    expect(SHORTCUT_CONTRACT.generateDrafts.sequence).toEqual(['G', 'D'])

    expect(keyboardSection).toContain("['⌘/Ctrl', '↵']")
    expect(SHORTCUT_CONTRACT.publishDraft.accelerator).toBe('CommandOrControl+Enter')

    expect(keyboardSection).toContain("['J', 'K']")
    expect(SHORTCUT_CONTRACT.listNext.key).toBe('J')
    expect(SHORTCUT_CONTRACT.listPrevious.key).toBe('K')

    expect(keyboardSection).toContain("['Esc']")
    expect(SHORTCUT_CONTRACT.contextualEscape.key).toBe('Esc')

    expect(keyboardSection).not.toContain('Alt')
    expect(keyboardSection).not.toContain('CommandOrControl+Alt+N')
  })
})
