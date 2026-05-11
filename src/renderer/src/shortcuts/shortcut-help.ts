import { SHORTCUT_CONTRACT, type ShortcutBinding } from '@shared/shortcuts'
import { shortcutBindingMeta } from './pilog-hotkeys'

export type ShortcutHelpItem = {
  id: string
  label: string
  shortcut: string
  binding: ShortcutBinding
}

const SHORTCUT_HELP_BINDINGS = [
  SHORTCUT_CONTRACT.globalCapture,
  SHORTCUT_CONTRACT.openInbox,
  SHORTCUT_CONTRACT.openDrafts,
  SHORTCUT_CONTRACT.generateDrafts,
  SHORTCUT_CONTRACT.publishDraft,
  SHORTCUT_CONTRACT.listNext,
  SHORTCUT_CONTRACT.listPrevious,
  SHORTCUT_CONTRACT.contextualEscape
] as const satisfies readonly ShortcutBinding[]

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
