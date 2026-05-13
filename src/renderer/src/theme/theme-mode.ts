export type ThemeMode = 'light' | 'dark' | 'system'
export type AppliedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'pilog.theme'
export const DEFAULT_THEME_MODE: ThemeMode = 'system'

type ThemeTarget = Pick<Document, 'documentElement'>

type ThemeWindow = Pick<Window, 'localStorage' | 'matchMedia'>

type ThemeController = {
  getMode: () => ThemeMode
  setMode: (mode: ThemeMode) => AppliedTheme
  dispose: () => void
}

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function getStoredThemeMode(storage: Storage): ThemeMode {
  const stored = storage.getItem(THEME_STORAGE_KEY)
  return isThemeMode(stored) ? stored : DEFAULT_THEME_MODE
}

export function getSystemTheme(matchMedia: Window['matchMedia']): AppliedTheme {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveAppliedTheme(
  mode: ThemeMode,
  matchMedia: Window['matchMedia']
): AppliedTheme {
  return mode === 'system' ? getSystemTheme(matchMedia) : mode
}

export function applyThemeClass(target: ThemeTarget, appliedTheme: AppliedTheme): void {
  target.documentElement.classList.toggle('dark', appliedTheme === 'dark')
  target.documentElement.style.colorScheme = appliedTheme
}

export function applyStoredTheme(
  target: ThemeTarget = document,
  themeWindow: ThemeWindow = window
): AppliedTheme {
  const mode = getStoredThemeMode(themeWindow.localStorage)
  const appliedTheme = resolveAppliedTheme(mode, themeWindow.matchMedia)
  applyThemeClass(target, appliedTheme)
  return appliedTheme
}

function resolveAppliedThemeFromMediaQuery(
  mode: ThemeMode,
  mediaQuery: MediaQueryList
): AppliedTheme {
  if (mode !== 'system') return mode
  return mediaQuery.matches ? 'dark' : 'light'
}

export function createThemeController(
  onChange?: (mode: ThemeMode, appliedTheme: AppliedTheme) => void,
  target: ThemeTarget = document,
  themeWindow: ThemeWindow = window
): ThemeController {
  const mediaQuery = themeWindow.matchMedia('(prefers-color-scheme: dark)')
  let mode = getStoredThemeMode(themeWindow.localStorage)

  const apply = (): AppliedTheme => {
    const appliedTheme = resolveAppliedThemeFromMediaQuery(mode, mediaQuery)
    applyThemeClass(target, appliedTheme)
    onChange?.(mode, appliedTheme)
    return appliedTheme
  }

  const handleSystemChange = (): void => {
    if (mode === 'system') apply()
  }

  mediaQuery.addEventListener('change', handleSystemChange)
  apply()

  return {
    getMode: () => mode,
    setMode: (nextMode) => {
      mode = nextMode
      themeWindow.localStorage.setItem(THEME_STORAGE_KEY, nextMode)
      return apply()
    },
    dispose: () => {
      mediaQuery.removeEventListener('change', handleSystemChange)
    }
  }
}
