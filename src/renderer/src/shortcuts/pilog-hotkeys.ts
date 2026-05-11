import {
  useHotkey,
  useHotkeySequence,
  type UseHotkeyOptions,
  type UseHotkeySequenceOptions,
  type Hotkey,
  type HotkeySequence
} from '@tanstack/react-hotkeys'
import {
  SHORTCUT_CONTRACT,
  formatShortcutForDisplay,
  getShortcutDisplayPlatform,
  type ShortcutBinding,
  type ShortcutDisplayPlatform
} from '@shared/shortcuts'

type ShortcutCallback = (event: KeyboardEvent) => void
type ShortcutBindingMeta = {
  name: string
  description: string
  pilogShortcutId: string
}
type GenerateDraftsShortcutState = {
  canGenerateDrafts: boolean
}
type PublishDraftShortcutState = {
  canPublish: boolean
  publishing: boolean
  saving: boolean
}
type ContextualEscapeState = {
  selectionCount: number
  target: EventTarget | null
  transientUiOpen: boolean
}

type PilogHotkeyOptions = Omit<
  UseHotkeyOptions,
  'ignoreInputs' | 'conflictBehavior' | 'meta' | 'preventDefault'
> & {
  allowInEditable?: boolean
  preventDefault?: boolean
}

type PilogHotkeySequenceOptions = Omit<
  UseHotkeySequenceOptions,
  'ignoreInputs' | 'conflictBehavior' | 'meta' | 'preventDefault'
> & {
  allowInEditable?: boolean
  preventDefault?: boolean
}

export const HOTKEY_CONFLICT_BEHAVIOR = import.meta.env.DEV ? 'warn' : 'allow'
const EDITABLE_SHORTCUT_TARGET_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .cm-content'
const TRANSIENT_UI_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[role="tooltip"][data-state="open"]',
  '[cmdk-dialog][data-state="open"]',
  '[data-slot="select-content"][data-state="open"]',
  '[data-radix-popper-content-wrapper] [data-state="open"]'
].join(', ')

export function usePilogHotkey(
  binding: ShortcutBinding,
  callback: ShortcutCallback,
  options: PilogHotkeyOptions = {}
): void {
  if (!('accelerator' in binding || 'key' in binding)) {
    throw new Error(`${binding.id} is a sequence shortcut. Use usePilogHotkeySequence instead.`)
  }

  const { allowInEditable = false, preventDefault = true, ...hotkeyOptions } = options

  useHotkey(shortcutBindingToTanStackHotkey(binding) as Hotkey, (event) => callback(event), {
    ...hotkeyOptions,
    preventDefault,
    ignoreInputs: !allowInEditable,
    conflictBehavior: HOTKEY_CONFLICT_BEHAVIOR,
    meta: shortcutBindingMeta(binding)
  })
}

export function usePilogHotkeySequence(
  binding: ShortcutBinding,
  callback: ShortcutCallback,
  options: PilogHotkeySequenceOptions = {}
): void {
  if (!('sequence' in binding)) {
    throw new Error(`${binding.id} is not a sequence shortcut. Use usePilogHotkey instead.`)
  }

  const { allowInEditable = false, preventDefault = true, ...sequenceOptions } = options

  useHotkeySequence(
    binding.sequence.map(normalizeKeyForTanStack) as HotkeySequence,
    (event) => callback(event),
    {
      ...sequenceOptions,
      preventDefault,
      ignoreInputs: !allowInEditable,
      conflictBehavior: HOTKEY_CONFLICT_BEHAVIOR,
      meta: shortcutBindingMeta(binding)
    }
  )
}

export function shortcutBindingToTanStackHotkey(binding: ShortcutBinding): string {
  if ('sequence' in binding) {
    return binding.sequence.map(normalizeKeyForTanStack).join(' ')
  }

  return normalizeAcceleratorForTanStack(
    'accelerator' in binding ? binding.accelerator : binding.key
  )
}

export function shortcutBindingMeta(
  binding: ShortcutBinding,
  platform: ShortcutDisplayPlatform = getCurrentShortcutDisplayPlatform()
): ShortcutBindingMeta {
  return {
    name: binding.label,
    description: formatShortcutForDisplay(shortcutBindingDisplayValue(binding), platform),
    pilogShortcutId: binding.id
  }
}

export function getCurrentShortcutDisplayPlatform(): ShortcutDisplayPlatform {
  if (typeof navigator === 'undefined') return 'linux'
  return getShortcutDisplayPlatform(navigator.platform)
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false

  const editable = target.closest(EDITABLE_SHORTCUT_TARGET_SELECTOR)

  return editable !== null
}

export function hasOpenTransientUi(root: ParentNode = document): boolean {
  return root.querySelector(TRANSIENT_UI_SELECTOR) !== null
}

export function shouldEnableGenerateDraftsShortcut({
  canGenerateDrafts
}: GenerateDraftsShortcutState): boolean {
  return canGenerateDrafts
}

export function shouldEnablePublishDraftShortcut({
  canPublish,
  publishing,
  saving
}: PublishDraftShortcutState): boolean {
  return canPublish && !publishing && !saving
}

export function shouldClearSelectionForContextualEscape({
  selectionCount,
  target,
  transientUiOpen
}: ContextualEscapeState): boolean {
  return selectionCount > 0 && !transientUiOpen && !isEditableShortcutTarget(target)
}

export const PILOG_APP_SHORTCUTS = {
  commandPalette: {
    id: 'app.commandPalette',
    label: 'Open command palette',
    accelerator: 'CommandOrControl+K'
  },
  save: {
    id: 'app.save',
    label: 'Save changes',
    accelerator: 'CommandOrControl+S'
  },
  ...SHORTCUT_CONTRACT
} as const satisfies Record<string, ShortcutBinding>

function normalizeAcceleratorForTanStack(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => {
      if (part === 'CommandOrControl' || part === 'CmdOrCtrl') return 'Mod'
      return normalizeKeyForTanStack(part)
    })
    .join('+')
}

function normalizeKeyForTanStack(key: string): string {
  return key === 'Esc' ? 'Escape' : key
}

function shortcutBindingDisplayValue(binding: ShortcutBinding): string | readonly string[] {
  if ('accelerator' in binding) return binding.accelerator
  if ('sequence' in binding) return binding.sequence
  return binding.key
}
