import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SHORTCUT_CONTRACT, type ShortcutBinding } from './shortcuts'

type SiteShortcutExpectation = {
  siteKeys: string
  binding: ShortcutBinding
  contractValue: string | readonly string[]
}

const SITE_SHORTCUT_EXPECTATIONS: readonly SiteShortcutExpectation[] = [
  {
    siteKeys: "['MOD', '⇧', 'Space']",
    binding: SHORTCUT_CONTRACT.globalCapture,
    contractValue: 'CommandOrControl+Shift+Space'
  },
  {
    siteKeys: "['MOD', '1']",
    binding: SHORTCUT_CONTRACT.openInbox,
    contractValue: 'CommandOrControl+1'
  },
  {
    siteKeys: "['MOD', '2']",
    binding: SHORTCUT_CONTRACT.openDrafts,
    contractValue: 'CommandOrControl+2'
  },
  {
    siteKeys: "['G', 'D']",
    binding: SHORTCUT_CONTRACT.generateDrafts,
    contractValue: ['G', 'D']
  },
  {
    siteKeys: "['MOD', '↵']",
    binding: SHORTCUT_CONTRACT.publishDraft,
    contractValue: 'CommandOrControl+Enter'
  },
  {
    siteKeys: "['J', 'K']",
    binding: SHORTCUT_CONTRACT.listNext,
    contractValue: 'J'
  },
  {
    siteKeys: "['Esc']",
    binding: SHORTCUT_CONTRACT.contextualEscape,
    contractValue: 'Esc'
  }
]

describe('/site shortcut section parity', () => {
  it('advertises the same keyboard-first contract as the Electron app', () => {
    const keyboardSection = readFileSync(
      resolve(process.cwd(), 'site/src/components/landing/keyboard.tsx'),
      'utf8'
    )

    for (const { siteKeys, binding, contractValue } of SITE_SHORTCUT_EXPECTATIONS) {
      expect(keyboardSection).toContain(siteKeys)
      expect(shortcutValue(binding)).toEqual(contractValue)
    }

    expect(SHORTCUT_CONTRACT.listPrevious.key).toBe('K')

    expect(keyboardSection).not.toContain('Alt')
    expect(keyboardSection).not.toContain('CommandOrControl+Alt+N')
  })
})

function shortcutValue(binding: ShortcutBinding): string | readonly string[] {
  if ('accelerator' in binding) return binding.accelerator
  if ('sequence' in binding) return binding.sequence
  return binding.key
}
