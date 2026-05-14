import { cn } from '@renderer/lib/utils'
import type { NoteStatus, NoteStatusCounts } from '@shared/ipc'

// Pilog's inbox status filter. Replaces the previous pill-shaped chip row,
// which (a) violated DESIGN.md's "no pill shapes" rule with `rounded-full`,
// and (b) reflowed when the moss "× N selected" indicator appeared on the
// same line. Both problems disappear once the filter becomes a vertical
// list: the rows have a fixed slot, and the selection indicator lives in
// its own row above it (see Inbox.tsx).
//
// The shape echoes Things 3's sidebar — one of PRODUCT.md's named
// references — as a compact 2-column grid (fewer vertical pixels for the
// notes list) while keeping row semantics: dot, label, count. Active state
// is signalled three ways (filled moss dot, ink text, Ash fill on the row) so the system stays compliant with DESIGN.md's
// Color-Independence Rule even for a user who can't see hue at all.
//
// Width budget: the leading dot column is fixed (size-1.5),
// the label takes the remaining row width, and the count tabulates to the
// right. Counts use `.tabular` so digits don't shimmy as the inbox
// updates.

export interface StatusFilterRow {
  /** NoteStatus value used by the inbox list filter. */
  value: NoteStatus
  /** Visible label. Title Case, no abbreviations. */
  label: string
}

interface StatusFilterProps {
  rows: StatusFilterRow[]
  counts: NoteStatusCounts
  /** Current active status, or undefined when "All" is implicit. */
  active: NoteStatus | undefined
  /** Toggles a status. Click on the active row clears the filter. */
  onToggle: (status: NoteStatus) => void
}

export function StatusFilter({
  rows,
  counts,
  active,
  onToggle
}: StatusFilterProps): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Filter by status"
      data-slot="status-filter"
      className="grid grid-cols-2 gap-x-1 gap-y-0.5"
    >
      {rows.map((row) => (
        <StatusFilterItem
          key={row.value}
          row={row}
          count={counts[row.value]}
          active={active === row.value}
          onToggle={() => onToggle(row.value)}
        />
      ))}
    </div>
  )
}

interface StatusFilterItemProps {
  row: StatusFilterRow
  count: number
  active: boolean
  onToggle: () => void
}

function StatusFilterItem({
  row,
  count,
  active,
  onToggle
}: StatusFilterItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      data-testid={`filter-${row.value}`}
      aria-pressed={active}
      onClick={onToggle}
      // The row is a button, not a radio: clicking the active row clears
      // the filter (matches the previous chip-row behaviour). Toggle
      // semantics live in `aria-pressed`; assistive tech announces the
      // pressed/not-pressed state correctly for each row.
      className={cn(
        'group/status-row flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5',
        'text-xs transition-colors duration-150 ease-[var(--ease-out-quart)] motion-reduce:duration-0',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
        active
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
    >
      {/* Color-independence: shape changes between filled (active) and
          ring (inactive) so the active state is legible even when colour
          isn't perceivable. The moss fill only appears on at most one row
          at a time, well under DESIGN.md's 10% accent budget. */}
      <span
        aria-hidden
        className={cn(
          'size-1.5 shrink-0 rounded-full transition-colors duration-150 ease-[var(--ease-out-quart)] motion-reduce:duration-0',
          active ? 'bg-primary' : 'border border-muted-foreground/40'
        )}
      />
      <span className="flex-1 truncate text-left">{row.label}</span>
      <span
        aria-hidden
        className={cn(
          'tabular shrink-0 text-[10px] transition-opacity duration-150 ease-[var(--ease-out-quart)] motion-reduce:duration-0',
          active ? 'text-foreground/70' : 'text-muted-foreground/60'
        )}
      >
        {count}
      </span>
      {/* Screen-reader-only count, separated from the visible glyph so
          assistive tech reads "Unprocessed, 2 notes" rather than the
          tabular digit alone. */}
      <span className="sr-only">
        {count} {count === 1 ? 'note' : 'notes'}
      </span>
    </button>
  )
}
