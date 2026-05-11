import { SHORTCUT_CONTRACT, type ShortcutBinding } from '@shared/shortcuts'
import { shortcutBindingMeta } from './pilog-hotkeys'

export type ShortcutHelpItem = {
  id: string
  label: string
  shortcut: string
  binding: ShortcutBinding
}

const SHORTCUT_HELP_BINDINGS: readonly ShortcutBinding[] = Object.values(SHORTCUT_CONTRACT)

export function getShortcutHelpItems(): ShortcutHelpItem[] {
  return SHORTCUT_HELP_BINDINGS.map((binding) => {
    const meta = shortcutBindingMeta(binding)
    return {
      id: binding.id,
      label: binding.label,
      shortcut: meta.description,
      binding
    }
  })
}
