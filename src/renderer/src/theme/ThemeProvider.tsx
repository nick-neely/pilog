import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  createThemeController,
  getStoredThemeMode,
  resolveAppliedTheme,
  type AppliedTheme,
  type ThemeMode
} from './theme-mode'
import { ThemeContext } from './useTheme'

type ThemeState = {
  mode: ThemeMode
  appliedTheme: AppliedTheme
}

function getInitialThemeState(): ThemeState {
  const mode = getStoredThemeMode(window.localStorage)
  return {
    mode,
    appliedTheme: resolveAppliedTheme(mode, window.matchMedia)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [themeState, setThemeState] = useState<ThemeState>(getInitialThemeState)
  const controllerRef = useRef<ReturnType<typeof createThemeController> | null>(null)

  useEffect(() => {
    const controller = createThemeController((nextMode, nextAppliedTheme) => {
      setThemeState({ mode: nextMode, appliedTheme: nextAppliedTheme })
    })
    controllerRef.current = controller

    return () => {
      controllerRef.current = null
      controller.dispose()
    }
  }, [])

  const value = useMemo(
    () => ({
      mode: themeState.mode,
      appliedTheme: themeState.appliedTheme,
      setMode: (nextMode: ThemeMode) => {
        controllerRef.current?.setMode(nextMode)
      }
    }),
    [themeState]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
