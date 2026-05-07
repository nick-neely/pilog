import { useEffect, useRef, useState } from 'react'
import { Plus, Search, Sparkles, XCircle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import type { ListNotesRequest, Note, NoteStatus } from '@shared/ipc'

const STATUS_CHIPS: { value: NoteStatus; label: string }[] = [
  { value: 'unprocessed', label: 'Unprocessed' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'published', label: 'Published' },
  { value: 'dismissed', label: 'Dismissed' }
]

function useDebounce(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

function buildFilter(status: NoteStatus | undefined, search: string): ListNotesRequest | undefined {
  const filter: ListNotesRequest = {}
  if (status) filter.status = status
  if (search) filter.search = search
  return Object.keys(filter).length > 0 ? filter : undefined
}

export function Inbox(): React.JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [statusFilter, setStatusFilter] = useState<NoteStatus | undefined>()
  const [searchInput, setSearchInput] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIndex = useRef<number | null>(null)
  const fetchIdRef = useRef(0)

  const debouncedSearch = useDebounce(searchInput, 250)

  useEffect(() => {
    const id = ++fetchIdRef.current
    window.pilog.invoke('note:list', buildFilter(statusFilter, debouncedSearch)).then((result) => {
      if (id !== fetchIdRef.current) return
      setNotes(result)
      setSelectedIds((prev) => {
        const validIds = new Set(result.map((n) => n.id))
        const next = new Set([...prev].filter((rid) => validIds.has(rid)))
        return next.size === prev.size ? prev : next
      })
    })
  }, [statusFilter, debouncedSearch])

  const handleNewNote = async (): Promise<void> => {
    await window.pilog.invoke('note:create', {
      content: `New note – ${new Date().toLocaleString()}`
    })
    const result = await window.pilog.invoke(
      'note:list',
      buildFilter(statusFilter, debouncedSearch)
    )
    setNotes(result)
  }

  const toggleStatus = (status: NoteStatus): void => {
    setStatusFilter((prev) => (prev === status ? undefined : status))
    setSelectedIds(new Set())
    lastClickedIndex.current = null
  }

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

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex flex-col gap-3 border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">Inbox</h1>
            {selectedIds.size > 0 && (
              <span
                data-testid="selected-count"
                className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
              >
                {selectedIds.size} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled
                  title="Generate Drafts activates in Phase 3"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Drafts
                </Button>
                <Button size="sm" variant="outline" disabled title="Dismiss activates in Phase 4">
                  <XCircle className="h-4 w-4" />
                  Dismiss
                </Button>
              </>
            )}
            <Button onClick={handleNewNote} size="sm">
              <Plus className="h-4 w-4" />
              New note
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip.value}
                data-testid={`filter-${chip.value}`}
                onClick={() => toggleStatus(chip.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === chip.value
                    ? 'bg-foreground text-background'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              data-testid="search-input"
              placeholder="Search notes…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-8 w-56 rounded-md border bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        {notes.length === 0 ? (
          <p className="text-muted-foreground text-center mt-12">
            {statusFilter || debouncedSearch
              ? 'No notes match the current filters.'
              : 'No notes yet. Click "+ New note" to get started.'}
          </p>
        ) : (
          <ul className="space-y-1">
            {notes.map((note, index) => (
              <li
                key={note.id}
                data-testid="note-row"
                onClick={(e) => handleNoteClick(note.id, index, e)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors select-none ${
                  selectedIds.has(note.id)
                    ? 'border-foreground/20 bg-accent'
                    : 'border-transparent hover:bg-accent/50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{note.content}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {note.status}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
