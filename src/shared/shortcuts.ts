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
const NON_CAPTURE_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])
const ELECTRON_KEY_NAMES = new Map<string, string>([
  [' ', 'Space'],
  ['ArrowUp', 'Up'],
  ['ArrowDown', 'Down'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
  ['Escape', 'Esc']
])

export type AcceleratorKeyEvent = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
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

export function acceleratorFromKeyEvent(
  event: AcceleratorKeyEvent,
  platform: ShortcutDisplayPlatform
): string | null {
  if (NON_CAPTURE_KEYS.has(event.key)) return null

  const key = normalizeElectronAcceleratorKey(event.key)
  if (key === null) return null

  const parts: string[] = []
  if (event.metaKey) parts.push('CommandOrControl')
  if (event.ctrlKey) parts.push(platform === 'mac' ? 'Control' : 'CommandOrControl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')

  if (parts.includes(key)) return null
  parts.push(key)

  return Array.from(new Set(parts)).join('+')
}

function normalizeElectronAcceleratorKey(key: string): string | null {
  if (ELECTRON_KEY_NAMES.has(key)) return ELECTRON_KEY_NAMES.get(key) ?? null
  if (/^[a-z]$/i.test(key)) return key.toUpperCase()
  if (/^[0-9]$/.test(key)) return key
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key)) return key
  if (key.length === 1) return key.toUpperCase()
  return key
}
