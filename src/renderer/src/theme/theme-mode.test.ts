import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  applyStoredTheme,
  createThemeController,
  getStoredThemeMode
} from './theme-mode'

describe('theme mode', () => {
  it('falls back to system mode for missing or invalid persisted values', () => {
    const storage = createStorage()

    expect(getStoredThemeMode(storage)).toBe(DEFAULT_THEME_MODE)

    storage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(getStoredThemeMode(storage)).toBe(DEFAULT_THEME_MODE)
  })

  it('applies the stored dark mode before React renders', () => {
    const target = createThemeTarget()
    const storage = createStorage({ [THEME_STORAGE_KEY]: 'dark' })
    const media = createMatchMedia(false)

    expect(applyStoredTheme(target, { localStorage: storage, matchMedia: media.matchMedia })).toBe(
      'dark'
    )
    expect(target.documentElement.classList.contains('dark')).toBe(true)
    expect(target.documentElement.style.colorScheme).toBe('dark')
  })

  it('tracks system preference changes while system mode is selected', () => {
    const target = createThemeTarget()
    const storage = createStorage({ [THEME_STORAGE_KEY]: 'system' })
    const media = createMatchMedia(false)
    const onChange = vi.fn()

    const controller = createThemeController(
      onChange,
      target,
      { localStorage: storage, matchMedia: media.matchMedia }
    )

    expect(controller.getMode()).toBe('system')
    expect(target.documentElement.classList.contains('dark')).toBe(false)

    media.setMatches(true)
    expect(target.documentElement.classList.contains('dark')).toBe(true)
    expect(onChange).toHaveBeenLastCalledWith('system', 'dark')

    controller.setMode('light')
    media.setMatches(true)
    expect(target.documentElement.classList.contains('dark')).toBe(false)
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light')

    controller.dispose()
  })
})

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  }
}

function createThemeTarget(): Pick<Document, 'documentElement'> {
  const classes = new Set<string>()
  return {
    documentElement: {
      classList: {
        contains: (className: string) => classes.has(className),
        toggle: (className: string, force?: boolean) => {
          const enabled = force ?? !classes.has(className)
          if (enabled) classes.add(className)
          else classes.delete(className)
          return enabled
        }
      },
      style: { colorScheme: '' }
    } as HTMLElement
  }
}

function createMatchMedia(initialMatches: boolean): {
  matchMedia: Window['matchMedia']
  setMatches: (matches: boolean) => void
} {
  let matches = initialMatches
  const listeners = new Set<() => void>()
  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_event: 'change', listener: () => void) => {
      listeners.add(listener)
    },
    removeEventListener: (_event: 'change', listener: () => void) => {
      listeners.delete(listener)
    }
  } as MediaQueryList

  return {
    matchMedia: () => mediaQueryList,
    setMatches: (nextMatches) => {
      matches = nextMatches
      Array.from(listeners).forEach((listener) => listener())
    }
  }
}
