export type ShortcutDisplayPlatform = 'mac' | 'windows' | 'linux'

export type ShortcutBinding =
  | {
      id: string
      label: string
      accelerator: string
    }
  | {
      id: string
      label: string
      sequence: readonly string[]
    }
  | {
      id: string
      label: string
      key: string
    }

export const SHORTCUT_CONTRACT = {
  globalCapture: {
    id: 'global.capture',
    label: 'Open scratchpad',
    accelerator: 'CommandOrControl+Shift+Space'
  },
  openInbox: {
    id: 'route.inbox',
    label: 'Open Inbox',
    accelerator: 'CommandOrControl+1'
  },
  openDrafts: {
    id: 'route.drafts',
    label: 'Open Drafts',
    accelerator: 'CommandOrControl+2'
  },
  generateDrafts: {
    id: 'draft.generate',
    label: 'Generate drafts',
    sequence: ['G', 'D']
  },
  publishDraft: {
    id: 'draft.publish',
    label: 'Publish draft',
    accelerator: 'CommandOrControl+Enter'
  },
  listNext: {
    id: 'list.next',
    label: 'Next item',
    key: 'J'
  },
  listPrevious: {
    id: 'list.previous',
    label: 'Previous item',
    key: 'K'
  },
  contextualEscape: {
    id: 'context.escape',
    label: 'Contextual back or clear',
    key: 'Esc'
  }
} as const satisfies Record<string, ShortcutBinding>

export const DEFAULT_GLOBAL_CAPTURE_SHORTCUT = SHORTCUT_CONTRACT.globalCapture.accelerator

export function getShortcutDisplayPlatform(platform: string): ShortcutDisplayPlatform {
  if (platform.toLowerCase().includes('mac')) return 'mac'
  if (platform.toLowerCase().includes('win')) return 'windows'
  return 'linux'
}

export function formatShortcutForDisplay(
  shortcut: string | readonly string[],
  platform: ShortcutDisplayPlatform
): string {
  if (typeof shortcut !== 'string') return shortcut.join(' ')

  const commandKey = platform === 'mac' ? '⌘' : 'Ctrl'

  return shortcut
    .split('+')
    .map((part) => {
      if (part === 'CommandOrControl' || part === 'CmdOrCtrl') return commandKey
      return part
    })
    .join(' + ')
}
