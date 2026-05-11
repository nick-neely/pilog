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

const COMMAND_OR_CONTROL_KEYS = new Set(['CommandOrControl', 'CmdOrCtrl'])

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
  const normalizedPlatform = platform.toLowerCase()

  if (normalizedPlatform.includes('mac')) return 'mac'
  if (normalizedPlatform.includes('win')) return 'windows'
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
      if (COMMAND_OR_CONTROL_KEYS.has(part)) return commandKey
      return part
    })
    .join(' + ')
}
