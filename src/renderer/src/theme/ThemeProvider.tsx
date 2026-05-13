import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createThemeController,
  getStoredThemeMode,
  resolveAppliedTheme,
  type AppliedTheme,
  type ThemeMode
} from './theme-mode'

type ThemeContextValue = {
  mode: ThemeMode
  appliedTheme: AppliedTheme
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function getInitialMode(): ThemeMode {
  return getStoredThemeMode(window.localStorage)
}

function getInitialAppliedTheme(): AppliedTheme {
  return resolveAppliedTheme(getInitialMode(), window.matchMedia)
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode)
  const [appliedTheme, setAppliedTheme] = useState<AppliedTheme>(getInitialAppliedTheme)
  const [setControllerMode, setSetControllerMode] = useState<((mode: ThemeMode) => void) | null>(
    null
  )

  useEffect(() => {
    const controller = createThemeController((nextMode, nextAppliedTheme) => {
      setModeState(nextMode)
      setAppliedTheme(nextAppliedTheme)
    })
    setSetControllerMode(() => (nextMode: ThemeMode) => {
      controller.setMode(nextMode)
    })

    return () => {
      controller.dispose()
    }
  }, [])

  const value = useMemo(
    () => ({
      mode,
      appliedTheme,
      setMode: (nextMode: ThemeMode) => {
        setControllerMode?.(nextMode)
      }
    }),
    [appliedTheme, mode, setControllerMode]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
