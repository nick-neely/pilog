import { isEditableShortcutTarget } from './pilog-hotkeys'

export type ListNavigationDirection = 'next' | 'previous'

export function getListNavigationIndex(input: {
  currentIndex: number
  itemCount: number
  direction: ListNavigationDirection
}): number {
  const { currentIndex, itemCount, direction } = input

  if (itemCount <= 0) return -1
  if (currentIndex < 0) return direction === 'next' ? 0 : itemCount - 1
  if (direction === 'next') return Math.min(itemCount - 1, currentIndex + 1)
  return Math.max(0, currentIndex - 1)
}

export function shouldHandleListNavigationShortcut(event: KeyboardEvent): boolean {
  if (isEditableShortcutTarget(event.target)) return false
  if (typeof document === 'undefined') return true
  if (document.querySelector('[data-slot="select-content"][data-state="open"]')) return false
  if (document.querySelector('[data-slot="alert-dialog-content"]')) return false
  if (document.querySelector('[data-slot="dialog-content"]')) return false
  if (document.querySelector('[data-slot="command-dialog-content"]')) return false

  return true
}
