import { Search01Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ViewTabs, type ViewTab } from '@renderer/features/shared/ViewTabs'
import type { ReactNode } from 'react'

// AppShell is the global window chrome for Pilog's tab views (Inbox,
// Agent Runs, and any future list-shaped views). It owns the only
// horizontal navigation strip in the app, so the sidebar never has to
// fight an action cluster for 320px of width.
//
// Two reasons this shell exists, not just a styled <header>:
//   1. View chrome is decoupled from view content. Inbox no longer
//      decides what the global Settings button looks like, and Agent
//      Runs no longer needs to invent its own chrome to match.
//   2. Tabs scale. Adding a fourth tab is one entry in `tabs`; the
//      strip has the full window width to grow into instead of
//      battling the sidebar's fixed 320px budget.

interface AppShellProps {
  tabs?: ViewTab[]
  activeTab?: string
  onTabChange: (next: string) => void
  onNavigateToSettings: () => void
  navigationSlot?: ReactNode
  /**
   * If provided, the search/Cmd-K affordance shows in the strip.
   * Hidden on views that don't have a palette (e.g., Agent Runs) so the
   * shortcut never lies about what it'll do.
   */
  onOpenCommandPalette?: () => void
  children: ReactNode
}

export function AppShell({
  tabs,
  activeTab,
  onTabChange,
  onNavigateToSettings,
  navigationSlot,
  onOpenCommandPalette,
  children
}: AppShellProps): React.JSX.Element {
  // The Cmd-K kbd hint is back inline because the top bar has window
  // width to spend on it; this is the affordance most worth keeping
  // discoverable in the chrome.
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
  const metaKey = isMac ? '⌘' : 'Ctrl'

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
        <div className="min-w-0">
          {navigationSlot ??
            (tabs && activeTab ? (
              <ViewTabs tabs={tabs} active={activeTab} onChange={onTabChange} />
            ) : null)}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onOpenCommandPalette ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="open-command"
                  onClick={onOpenCommandPalette}
                  aria-label="Open command palette"
                  className="gap-1.5 px-2 text-xs text-muted-foreground"
                >
                  <HugeiconsIcon icon={Search01Icon} aria-hidden />
                  <kbd className="pointer-events-none font-mono">{metaKey}K</kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Search and commands</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                data-testid="open-settings"
                onClick={onNavigateToSettings}
                aria-label="Settings"
              >
                <HugeiconsIcon icon={Settings02Icon} aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
