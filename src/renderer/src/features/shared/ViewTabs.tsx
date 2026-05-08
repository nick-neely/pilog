import type { ReactNode } from 'react'
import { cn } from '@renderer/lib/utils'

// PiLog's app-level view nav. Lives in the global top bar (see AppShell);
// the sidebar deliberately doesn't render this so view chrome and view
// content stay separated.
//
// Implementation notes worth keeping:
//   * The active tab renders an <h1>, the inactive tab renders a <button>.
//     One h1 per page (matches e2e expectations like
//     `expect(page.locator('h1')).toHaveText('Inbox')`) and a clean
//     "you're already here, no action" semantic via `aria-current="page"`.
//   * The 2px moss underline is the One-Voice accent: at-a-glance state,
//     ≤10% of the surface. No pill, no boxed border, type carries
//     hierarchy. Same treatment regardless of how many tabs we add.
//   * Tabs is a list — pass any number. The strip lives full-width in the
//     top bar, so adding "Drafts" or "Search" later is just appending
//     a descriptor.

export interface ViewTab {
  /** Stable value used to determine active state and dispatch onChange. */
  value: string
  /** Visible label, becomes the page heading text when active. */
  label: string
  /** Optional badge (count, indicator) shown next to the label. */
  badge?: ReactNode
  /** data-testid for the inactive (button) form. */
  testId?: string
  /** data-testid for the active (h1) form. */
  activeTestId?: string
}

interface ViewTabsProps {
  tabs: ViewTab[]
  active: string
  onChange: (next: string) => void
}

export function ViewTabs({ tabs, active, onChange }: ViewTabsProps): React.JSX.Element {
  return (
    <nav
      aria-label="Switch view"
      className="flex min-w-0 items-baseline gap-5"
      data-slot="view-tabs"
    >
      {tabs.map((tab) => (
        <ViewTabItem
          key={tab.value}
          label={tab.label}
          active={tab.value === active}
          onSelect={() => onChange(tab.value)}
          badge={tab.badge}
          testId={tab.testId}
          activeTestId={tab.activeTestId}
        />
      ))}
    </nav>
  )
}

interface ViewTabItemProps {
  label: string
  active: boolean
  onSelect: () => void
  badge?: ReactNode
  testId?: string
  activeTestId?: string
}

function ViewTabItem({
  label,
  active,
  onSelect,
  badge,
  testId,
  activeTestId
}: ViewTabItemProps): React.JSX.Element {
  // Layout split: a baseline-aligned row of label + optional badge, with
  // the moss underline as a sibling pseudo-element. Badge stays outside
  // the <h1> so heading text stays clean for assistive tech and tests.
  const sharedTextClasses = 'font-heading text-xl font-medium tracking-tight transition-colors'

  return (
    <div
      className={cn(
        'group/view-tab relative flex shrink-0 items-baseline gap-2 py-1',
        // Anchored 7px below text baseline so the underline sits flush
        // with the bottom border of the surrounding header.
        'after:absolute after:inset-x-0 after:-bottom-[7px] after:h-[2px] after:rounded-full after:bg-primary after:transition-opacity',
        active ? 'after:opacity-100' : 'after:opacity-0'
      )}
    >
      {active ? (
        <h1
          data-testid={activeTestId}
          aria-current="page"
          className={cn(sharedTextClasses, 'text-foreground')}
        >
          {label}
        </h1>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          data-testid={testId}
          className={cn(
            sharedTextClasses,
            'cursor-pointer rounded-sm text-muted-foreground hover:text-foreground',
            'focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30'
          )}
        >
          {label}
        </button>
      )}
      {badge ? (
        <span
          className={cn(
            'shrink-0 text-xs',
            active ? 'text-muted-foreground' : 'text-muted-foreground/70'
          )}
        >
          {badge}
        </span>
      ) : null}
    </div>
  )
}
