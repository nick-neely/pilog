import { isEditableShortcutTarget } from './pilog-hotkeys'

export type ListNavigationDirection = 'next' | 'previous'

const KEYBOARD_OWNING_SURFACE_SELECTORS = [
  '[data-slot="select-content"][data-state="open"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="dialog-content"]',
  '[data-slot="command-dialog-content"]'
] as const

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

export function getSelectedListNavigationIndex(input: {
  selectedIndexes: readonly number[]
  direction: ListNavigationDirection
}): number {
  const { selectedIndexes, direction } = input

  if (selectedIndexes.length === 0) return -1

  switch (direction) {
    case 'next':
      return Math.max(...selectedIndexes)
    case 'previous':
      return Math.min(...selectedIndexes)
  }
}

export function shouldHandleListNavigationShortcut(event: KeyboardEvent): boolean {
  if (isEditableShortcutTarget(event.target)) return false
  if (typeof document === 'undefined') return true

  const keyboardOwningSurfaceIsOpen = KEYBOARD_OWNING_SURFACE_SELECTORS.some((selector) =>
    document.querySelector(selector)
  )

  if (keyboardOwningSurfaceIsOpen) return false

  return true
}
