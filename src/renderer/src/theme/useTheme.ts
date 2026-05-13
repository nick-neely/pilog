import { createContext, useContext } from 'react'
import type { AppliedTheme, ThemeMode } from './theme-mode'

export type ThemeContextValue = {
  mode: ThemeMode
  appliedTheme: AppliedTheme
  setMode: (mode: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
