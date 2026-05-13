import { Search01Icon, Settings02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from '@renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { ViewTabs, type ViewTab } from '@renderer/features/shared/ViewTabs'
import { cn } from '@renderer/lib/utils'
import { PILOG_APP_SHORTCUTS, shortcutBindingMeta } from '@renderer/shortcuts/pilog-hotkeys'
import {
  ELECTRON_DRAG_REGION_CLASS,
  ELECTRON_NO_DRAG_REGION_CLASS,
  MAIN_WINDOW_CONTROL_INSET_CLASS
} from '@shared/window-chrome'
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
  const commandPaletteShortcut = shortcutBindingMeta(PILOG_APP_SHORTCUTS.commandPalette).description

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header
        className={cn(
          'flex h-12 shrink-0 items-center gap-4 bg-background pl-4',
          MAIN_WINDOW_CONTROL_INSET_CLASS,
          ELECTRON_DRAG_REGION_CLASS
        )}
      >
        <div className={cn('min-w-0 shrink', ELECTRON_NO_DRAG_REGION_CLASS)}>
          {navigationSlot ??
            (tabs && activeTab ? (
              <ViewTabs tabs={tabs} active={activeTab} onChange={onTabChange} />
            ) : null)}
        </div>
        <div
          aria-hidden="true"
          className={cn('min-w-4 flex-1 self-stretch', ELECTRON_DRAG_REGION_CLASS)}
        />
        <div className={cn('flex shrink-0 items-center gap-1', ELECTRON_NO_DRAG_REGION_CLASS)}>
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
                  <kbd className="pointer-events-none font-mono">{commandPaletteShortcut}</kbd>
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
      <div className="min-h-0 flex-1 border-t">{children}</div>
    </div>
  )
}
