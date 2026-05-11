import {
  HotkeysProvider,
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
import type { ReactNode } from 'react'

type ShortcutCallback = (event: KeyboardEvent) => void

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

export function PilogHotkeysProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <HotkeysProvider
      defaultOptions={{
        hotkey: {
          conflictBehavior: import.meta.env.DEV ? 'warn' : 'allow',
          ignoreInputs: true,
          preventDefault: true,
          stopPropagation: true
        },
        hotkeySequence: {
          conflictBehavior: import.meta.env.DEV ? 'warn' : 'allow',
          ignoreInputs: true,
          preventDefault: true,
          stopPropagation: true,
          timeout: 1500
        }
      }}
    >
      {children}
    </HotkeysProvider>
  )
}

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
    conflictBehavior: import.meta.env.DEV ? 'warn' : 'allow',
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
      conflictBehavior: import.meta.env.DEV ? 'warn' : 'allow',
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
): { name: string; description: string; pilogShortcutId: string } {
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

  const editable = target.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .cm-content'
  )

  return editable !== null
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
