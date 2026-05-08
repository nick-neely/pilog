import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  Search01Icon,
  Settings02Icon,
  SparklesIcon
} from '@hugeicons/core-free-icons'
import { Button } from '@renderer/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@renderer/components/ui/command'
import { Badge } from '@renderer/components/ui/badge'
import { Empty, EmptyDescription } from '@renderer/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import type { ListNotesRequest, Note, NoteStatus, Repo } from '@shared/ipc'

const STATUS_CHIPS: { value: NoteStatus; label: string }[] = [
  { value: 'unprocessed', label: 'Unprocessed' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'published', label: 'Published' },
  { value: 'dismissed', label: 'Dismissed' }
]

const STATUS_LABEL: Record<NoteStatus, string> = STATUS_CHIPS.reduce(
  (acc, { value, label }) => ({ ...acc, [value]: label }),
  {} as Record<NoteStatus, string>
)

// Detect once at module load. Affects only the visible kbd hint, never the
// keybind handler (which always accepts both metaKey and ctrlKey).
const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
const META_KEY = IS_MAC ? '⌘' : 'Ctrl'

// Humanise the timestamp for inbox metadata: same year stays short
// ("May 7, 9:18 PM"), prior years fall back to a year-bearing form. Pairs
// with `.tabular` so digits don't shimmy as the list updates.
function formatNoteTimestamp(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}

function useDebounce(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

// repoFilter encoding for Select values (non-empty strings for Radix Select items).
//   '__all__'     → undefined (All repos — no filter)
//   '$unassigned' → null      (only notes with no repo)
//   repo.id       → repo.id   (specific repo)
const FILTER_ALL_REPOS = '__all__'
const UNASSIGNED_KEY = '$unassigned'
/** Note/scratchpad: no repo assigned */
const NOTE_REPO_NONE = '__none__'

function encodeRepoFilter(f: string | null | undefined): string {
  if (f === undefined) return FILTER_ALL_REPOS
  if (f === null) return UNASSIGNED_KEY
  return f
}

function decodeRepoFilter(v: string): string | null | undefined {
  if (v === FILTER_ALL_REPOS) return undefined
  if (v === UNASSIGNED_KEY) return null
  return v
}

function buildFilter(
  status: NoteStatus | undefined,
  search: string,
  repoFilter: string | null | undefined
): ListNotesRequest | undefined {
  const filter: ListNotesRequest = {}
  if (status) filter.status = status
  if (search) filter.search = search
  if (repoFilter !== undefined) filter.repoId = repoFilter
  return Object.keys(filter).length > 0 ? filter : undefined
}

function NoteDetail({
  note,
  repos,
  onSave,
  onDelete,
  onRepoChange,
  onNavigateToRepositories
}: {
  note: Note
  repos: Repo[]
  onSave: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRepoChange: (id: string, repoId: string | null) => Promise<void>
  onNavigateToRepositories: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(note.content)
  const dirty = draft !== note.content

  const handleSave = useCallback(async (): Promise<void> => {
    await onSave(note.id, draft)
  }, [draft, note.id, onSave])

  // Mod+S saves, matching the Scratchpad's editor convention. Keyboard-first
  // is a system promise; the visible Save button is a courtesy, not the path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'
      if (!isSave) return
      e.preventDefault()
      if (dirty) void handleSave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, handleSave])

  return (
    <article className="flex h-full flex-col">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
        <p className="tabular font-mono text-xs text-muted-foreground">
          {formatNoteTimestamp(note.createdAt)}
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={!dirty} size="sm">
            Save
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. The note and any draft history derived from it will be
                  removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => onDelete(note.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <Textarea
          aria-label="Note content"
          // Body line length capped at 72ch per DESIGN.md; mono editor body
          // pairs with the rest of the system (file paths, code blocks).
          className="block min-h-full w-full max-w-[72ch] mx-auto rounded-none border-0 bg-transparent px-6 py-6 font-mono text-sm leading-relaxed text-foreground shadow-none field-sizing-content focus-visible:ring-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Capture a thought…"
          autoFocus
        />
      </div>
      {/* Repo association — below the content area */}
      <footer className="flex min-h-14 shrink-0 items-center border-t px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Repo</span>
          {repos.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No repos linked —{' '}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={onNavigateToRepositories}
              >
                link one in Repositories
              </Button>
            </span>
          ) : (
            <Select
              value={note.repoId ?? NOTE_REPO_NONE}
              onValueChange={(v) => void onRepoChange(note.id, v === NOTE_REPO_NONE ? null : v)}
            >
              <SelectTrigger
                aria-label="Repository"
                size="sm"
                className="max-w-[min(100%,14rem)] text-xs"
              >
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NOTE_REPO_NONE}>Unassigned</SelectItem>
                  {repos.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.owner}/{r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
      </footer>
    </article>
  )
}

export function Inbox({
  onNavigateToRepositories,
  onNavigateToSettings
}: {
  onNavigateToRepositories: () => void
  onNavigateToSettings: () => void
}): React.JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [repos, setRepos] = useState<Repo[]>([])
  const [statusFilter, setStatusFilter] = useState<NoteStatus | undefined>()
  const [repoFilter, setRepoFilter] = useState<string | null | undefined>(undefined)
  const [commandOpen, setCommandOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIndex = useRef<number | null>(null)
  const fetchIdRef = useRef(0)

  // The palette's text query also seeds the server-side search filter so
  // typing in the palette narrows the inbox list as a side-effect, not the
  // primary lever. The list filter remains driven by status chips; the
  // palette's job is jump-to-result and command-running.
  const debouncedPaletteQuery = useDebounce(paletteQuery, 200)

  // Lookup map for note rows to show repo name without a linear search
  const reposById = useMemo(() => new Map(repos.map((r) => [r.id, r])), [repos])

  useEffect(() => {
    window.pilog.invoke('repos:list').then(setRepos)
  }, [])

  const fetchNotes = useCallback(async (): Promise<void> => {
    const id = ++fetchIdRef.current
    const result = await window.pilog.invoke(
      'note:list',
      buildFilter(statusFilter, debouncedPaletteQuery, repoFilter)
    )
    if (id !== fetchIdRef.current) return
    setNotes(result)
    setSelectedIds((prev) => {
      const validIds = new Set(result.map((n) => n.id))
      const next = new Set([...prev].filter((rid) => validIds.has(rid)))
      return next.size === prev.size ? prev : next
    })
  }, [statusFilter, debouncedPaletteQuery, repoFilter])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  useEffect(() => {
    return window.pilog.on('note:created', () => {
      fetchNotes()
    })
  }, [fetchNotes])

  const handleNewNote = useCallback(async (): Promise<void> => {
    // Capture-before-triage: a new note opens empty so the editor is waiting,
    // not pre-loaded with boilerplate the user has to delete first.
    const created = await window.pilog.invoke('note:create', { content: '' })
    await fetchNotes()
    setSelectedIds(new Set([created.id]))
  }, [fetchNotes])

  const handleSave = async (id: string, content: string): Promise<void> => {
    await window.pilog.invoke('note:update', { id, content })
    await fetchNotes()
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.pilog.invoke('note:delete', { id })
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    await fetchNotes()
  }

  const handleRepoChange = async (id: string, repoId: string | null): Promise<void> => {
    const note = notes.find((n) => n.id === id)
    if (!note) return
    await window.pilog.invoke('note:update', { id, content: note.content, repoId })
    await fetchNotes()
  }

  const toggleStatus = useCallback((status: NoteStatus): void => {
    setStatusFilter((prev) => (prev === status ? undefined : status))
    setSelectedIds(new Set())
    lastClickedIndex.current = null
  }, [])

  const clearStatusFilter = useCallback((): void => {
    setStatusFilter(undefined)
    setSelectedIds(new Set())
    lastClickedIndex.current = null
  }, [])

  const clearSelection = useCallback((): void => {
    setSelectedIds(new Set())
    lastClickedIndex.current = null
  }, [])

  const handleNoteClick = (noteId: string, index: number, e: React.MouseEvent): void => {
    if (e.shiftKey && lastClickedIndex.current !== null) {
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      const rangeIds = notes.slice(start, end + 1).map((n) => n.id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of rangeIds) next.add(id)
        return next
      })
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(noteId)) {
          next.delete(noteId)
        } else {
          next.add(noteId)
        }
        return next
      })
    } else {
      setSelectedIds((prev) => {
        if (prev.size === 1 && prev.has(noteId)) return new Set()
        return new Set([noteId])
      })
    }
    lastClickedIndex.current = index
  }

  const selectedNote =
    selectedIds.size === 1 ? (notes.find((n) => selectedIds.has(n.id)) ?? null) : null

  const selectionCount = selectedIds.size
  const hasSelection = selectionCount > 0

  // Single open/close path so the query reset, focus restoration, and any
  // future side-effects all live together. Avoids a setState-in-effect
  // dependency cycle on commandOpen.
  const setPaletteOpen = useCallback((open: boolean): void => {
    setCommandOpen(open)
    if (!open) setPaletteQuery('')
  }, [])

  // Cmd/Ctrl+K toggles the command palette globally on the inbox surface.
  // Esc clears any active selection, but only when the user isn't typing in
  // an input/textarea/contenteditable and the palette isn't open (cmdk and
  // Radix's AlertDialog both intercept Esc themselves before it reaches us).
  // The kbd hint shows ⌘ on macOS, Ctrl elsewhere; the keybind handler
  // accepts both regardless.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(!commandOpen)
        return
      }
      if (e.key === 'Escape' && selectedIds.size > 0 && !commandOpen) {
        const active = document.activeElement as HTMLElement | null
        const tag = active?.tagName.toLowerCase()
        const editable = tag === 'input' || tag === 'textarea' || active?.isContentEditable === true
        if (editable) return
        e.preventDefault()
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [commandOpen, setPaletteOpen, selectedIds.size, clearSelection])

  const emptyMessage = useMemo(() => {
    const filtered = Boolean(statusFilter || debouncedPaletteQuery || repoFilter !== undefined)
    return filtered
      ? 'No notes match the current filters.'
      : 'No notes yet. Capture a thought from the footer below.'
  }, [statusFilter, debouncedPaletteQuery, repoFilter])

  const runCommand = (action: () => void): void => {
    setPaletteOpen(false)
    // Defer the action one tick so the dialog can finish closing before any
    // state change re-renders the underlying surface, keeping focus
    // restoration from the dialog clean.
    requestAnimationFrame(action)
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/*
        Sidebar — overflow-hidden + min-w-0 keep any future toolbar overflow
        contained instead of bleeding into the detail pane (the bug from the
        first polish pass). The sidebar is structured as four regions:
          (1) title strip with capture-mode count or triage-mode badge
          (2) filter rail (status chips + full-width repo row)
          (3) scrolling list (the only region that grows)
          (4) mode footer that swaps capture <-> triage
        The Cmd+K palette absorbs search and discovery so the chrome above
        no longer competes for vertical space.
      */}
      <div className="flex w-80 min-w-0 shrink-0 flex-col overflow-hidden border-r">
        {/* (1) Title strip — single line, never grows */}
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <h1 className="font-heading text-xl font-medium tracking-tight">Inbox</h1>
            {hasSelection ? (
              // The selection-count chip is also the clear-selection control.
              // Co-locating "you have a selection" with "exit the selection"
              // means the user never has to look elsewhere to find the
              // escape hatch. Esc and the palette's "Clear selection" command
              // do the same job for keyboard users.
              <Button
                type="button"
                variant="ghost"
                size="xs"
                data-testid="selected-count"
                onClick={clearSelection}
                title="Clear selection (Esc)"
                aria-label={`Clear ${selectionCount} selected ${
                  selectionCount === 1 ? 'note' : 'notes'
                }`}
                className="tabular rounded-full px-1.5 py-0.5 text-muted-foreground"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  data-icon="inline-start"
                  aria-hidden
                  strokeWidth={2}
                />
                {selectionCount} selected
              </Button>
            ) : (
              notes.length > 0 && (
                <span className="tabular text-xs text-muted-foreground">{notes.length}</span>
              )
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              data-testid="open-settings"
              onClick={() => onNavigateToSettings()}
              aria-label="Settings"
              title="Settings"
            >
              <HugeiconsIcon icon={Settings02Icon} aria-hidden />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="open-command"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              title="Search and commands"
              className="gap-1.5 px-2 text-xs text-muted-foreground"
            >
              <HugeiconsIcon icon={Search01Icon} aria-hidden />
              <kbd className="pointer-events-none font-mono">{META_KEY}K</kbd>
            </Button>
          </div>
        </header>

        {/* (2) Filter rail — status row, then repo (avoids wrapped chip + orphaned select) */}
        <div className="flex shrink-0 flex-col gap-2 border-b px-6 py-2.5">
          <div className="flex flex-wrap gap-x-1.5 gap-y-1">
            {STATUS_CHIPS.map((chip) => {
              const active = statusFilter === chip.value
              return (
                <Button
                  key={chip.value}
                  type="button"
                  variant={active ? 'secondary' : 'ghost'}
                  size="xs"
                  data-testid={`filter-${chip.value}`}
                  onClick={() => toggleStatus(chip.value)}
                  aria-pressed={active}
                  className="rounded-full gap-1.5 font-medium"
                >
                  {/* Moss leading dot only on the active filter — type-led
                      emphasis with a small on-brand accent, not a fill. */}
                  <span
                    aria-hidden
                    className={
                      'h-1.5 w-1.5 rounded-full transition-colors ' +
                      (active ? 'bg-primary' : 'bg-transparent')
                    }
                  />
                  {chip.label}
                </Button>
              )
            })}
          </div>
          <Select
            value={encodeRepoFilter(repoFilter)}
            onValueChange={(v) => {
              setRepoFilter(decodeRepoFilter(v))
              setSelectedIds(new Set())
              lastClickedIndex.current = null
            }}
            disabled={repos.length === 0}
          >
            <SelectTrigger
              aria-label="Filter by repository"
              data-testid="filter-repo"
              size="sm"
              className="h-8 w-full max-w-full text-xs text-muted-foreground disabled:opacity-40"
            >
              <SelectValue placeholder="All repos" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={FILTER_ALL_REPOS}>All repos</SelectItem>
                <SelectItem value={UNASSIGNED_KEY}>Unassigned</SelectItem>
                {repos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.owner}/{r.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* (3) Scrolling list */}
        <main className="flex-1 overflow-y-auto p-3">
          {notes.length === 0 ? (
            <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
              <EmptyDescription>{emptyMessage}</EmptyDescription>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {notes.map((note, index) => {
                const isSelected = selectedIds.has(note.id)
                const preview = note.content.trim() || 'Untitled note'
                const repo = note.repoId ? reposById.get(note.repoId) : undefined
                return (
                  <li
                    key={note.id}
                    data-testid="note-row"
                    onClick={(e) => handleNoteClick(note.id, index, e)}
                    className={
                      'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 transition-colors select-none ' +
                      (isSelected
                        ? 'border-border bg-muted'
                        : 'border-transparent hover:bg-muted/60')
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-snug">{preview}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <Badge variant="secondary" className="font-medium text-foreground/80">
                          {STATUS_LABEL[note.status]}
                        </Badge>
                        {repo && (
                          <span className="truncate font-mono text-xs text-muted-foreground/70">
                            {repo.owner}/{repo.name}
                          </span>
                        )}
                        <span className="tabular text-muted-foreground">
                          {formatNoteTimestamp(note.createdAt)}
                        </span>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </main>

        {/* (4) Mode footer — capture by default, triage on selection */}
        <footer className="flex min-h-14 shrink-0 items-center border-t bg-background px-6 py-3">
          {hasSelection ? (
            // Triage-mode: only the two actual triage actions. Clearing the
            // selection lives on the title strip (the count chip) and on
            // Esc / the palette, which keeps the footer uncluttered and
            // gives the action buttons room to breathe in 320px.
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Generate Drafts activates in Phase 3"
                className="flex-1 justify-center"
              >
                <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" aria-hidden />
                Generate Drafts
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled
                title="Dismiss activates in Phase 4"
                className="flex-1 justify-center"
              >
                <HugeiconsIcon icon={CancelCircleIcon} data-icon="inline-start" aria-hidden />
                Dismiss
              </Button>
            </div>
          ) : (
            <Button
              onClick={handleNewNote}
              size="sm"
              className="w-full justify-center"
              data-testid="new-note-footer"
            >
              <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden />
              New note
            </Button>
          )}
        </footer>
      </div>

      {/*
        Detail pane — flex-1, never a fixed width. The Editor-Gravitational
        Rule: when a note is open, the textarea is the visual centre.
      */}
      <section className="flex-1 min-w-0">
        {selectedNote ? (
          <NoteDetail
            key={selectedNote.id}
            note={selectedNote}
            repos={repos}
            onSave={handleSave}
            onDelete={handleDelete}
            onRepoChange={handleRepoChange}
            onNavigateToRepositories={onNavigateToRepositories}
          />
        ) : (
          <Empty className="h-full border-none bg-transparent shadow-none">
            <EmptyDescription className="max-w-[36ch]">
              {selectionCount > 1
                ? `${selectionCount} notes selected. Triage actions live in the sidebar footer; press Esc to clear.`
                : 'Select a note to read or edit.'}
            </EmptyDescription>
          </Empty>
        )}
      </section>

      {/*
        Cmd+K palette — single keystroke surfaces capture, filter, and
        jump-to-note in one place. The visible search input from the previous
        polish pass moved here; the test data-testid follows it.
      */}
      <CommandDialog open={commandOpen} onOpenChange={setPaletteOpen}>
        <CommandInput
          data-testid="search-input"
          placeholder="Search notes, run a command…"
          value={paletteQuery}
          onValueChange={setPaletteQuery}
        />
        <CommandList>
          <CommandEmpty>Nothing matches that yet.</CommandEmpty>

          <CommandGroup heading="Capture">
            <CommandItem
              data-testid="cmd-new-note"
              onSelect={() => runCommand(() => void handleNewNote())}
            >
              <HugeiconsIcon icon={Add01Icon} aria-hidden />
              <span>New note</span>
              <CommandShortcut>{META_KEY}N</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Navigate">
            <CommandItem
              data-testid="cmd-settings"
              onSelect={() => runCommand(onNavigateToSettings)}
            >
              <HugeiconsIcon icon={Settings02Icon} aria-hidden />
              <span>Settings</span>
              <CommandShortcut>{`${META_KEY},`}</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Filters">
            {STATUS_CHIPS.map((chip) => {
              const active = statusFilter === chip.value
              return (
                <CommandItem
                  key={chip.value}
                  data-testid={`cmd-filter-${chip.value}`}
                  onSelect={() => runCommand(() => toggleStatus(chip.value))}
                >
                  <span
                    aria-hidden
                    className={
                      'h-1.5 w-1.5 rounded-full ' +
                      (active ? 'bg-primary' : 'bg-muted-foreground/40')
                    }
                  />
                  <span>{`Show ${chip.label.toLowerCase()}`}</span>
                  {active && <CommandShortcut>active</CommandShortcut>}
                </CommandItem>
              )
            })}
            {statusFilter && (
              <CommandItem onSelect={() => runCommand(clearStatusFilter)}>
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                <span>Clear status filter</span>
              </CommandItem>
            )}
          </CommandGroup>

          {hasSelection && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Selection">
                <CommandItem onSelect={() => runCommand(clearSelection)}>
                  <span>Clear selection</span>
                  <CommandShortcut>Esc</CommandShortcut>
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </div>
  )
}
