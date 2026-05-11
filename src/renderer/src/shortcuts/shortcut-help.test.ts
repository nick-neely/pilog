import { describe, expect, it } from 'vitest'
import { SHORTCUT_CONTRACT, formatShortcutForDisplay } from '@shared/shortcuts'
import { getShortcutHelpItems } from './shortcut-help'

describe('shortcut help parity', () => {
  it('lists every advertised shortcut from the canonical contract', () => {
    const helpItems = getShortcutHelpItems()

    expect(helpItems.map((item) => item.id)).toEqual(
      Object.values(SHORTCUT_CONTRACT).map((binding) => binding.id)
    )
  })

  it('formats help labels from the same contract metadata path as registered hotkeys', () => {
    const helpItems = getShortcutHelpItems()

    expect(helpItems).toEqual([
      expect.objectContaining({
        id: 'global.capture',
        label: 'Open scratchpad',
        shortcut: formatShortcutForDisplay('CommandOrControl+Shift+Space', 'linux')
      }),
      expect.objectContaining({
        id: 'route.inbox',
        label: 'Open Inbox',
        shortcut: formatShortcutForDisplay('CommandOrControl+1', 'linux')
      }),
      expect.objectContaining({
        id: 'route.drafts',
        label: 'Open Drafts',
        shortcut: formatShortcutForDisplay('CommandOrControl+2', 'linux')
      }),
      expect.objectContaining({
        id: 'draft.generate',
        label: 'Generate drafts',
        shortcut: 'G D'
      }),
      expect.objectContaining({
        id: 'draft.publish',
        label: 'Publish draft',
        shortcut: formatShortcutForDisplay('CommandOrControl+Enter', 'linux')
      }),
      expect.objectContaining({ id: 'list.next', label: 'Next item', shortcut: 'J' }),
      expect.objectContaining({ id: 'list.previous', label: 'Previous item', shortcut: 'K' }),
      expect.objectContaining({
        id: 'context.escape',
        label: 'Contextual back or clear',
        shortcut: 'Esc'
      })
    ])
  })
})
