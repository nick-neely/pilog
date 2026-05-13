'use client'

import { cn } from '@pilog/ui/utils'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const themeChoices = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'Auto' }
] as const

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // next-themes `theme` is undefined on the server; keep the first client
    // paint aligned with SSR, then reveal the persisted theme after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  const selectedTheme: string | undefined = mounted ? theme : 'system'

  return (
    <div
      aria-label="Theme"
      role="radiogroup"
      className="border-border bg-background/95 inline-flex h-8 items-center rounded-md border p-0.5"
      suppressHydrationWarning
    >
      {themeChoices.map((choice) => {
        const selected = selectedTheme === choice.id
        return (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`Use ${choice.label.toLowerCase()} theme`}
            onClick={() => setTheme(choice.id)}
            className={cn(
              'text-muted-foreground hover:text-foreground focus-visible:ring-ring/30 focus-visible:border-ring inline-flex h-6 min-w-9 items-center justify-center rounded-sm border border-transparent px-1.5 text-[0.7rem] font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none sm:min-w-12 sm:px-2 sm:text-[0.75rem]',
              selected && 'bg-secondary text-foreground border-border'
            )}
          >
            {choice.label}
          </button>
        )
      })}
    </div>
  )
}
