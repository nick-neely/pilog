import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
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
import type { Note } from '@shared/ipc'

function NoteDetail({
  note,
  onSave,
  onDelete
}: {
  note: Note
  onSave: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState(note.content)
  const dirty = draft !== note.content

  const handleSave = async (): Promise<void> => {
    await onSave(note.id, draft)
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <p className="text-xs text-muted-foreground">{new Date(note.createdAt).toLocaleString()}</p>
        <div className="flex gap-2">
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
                <AlertDialogTitle>Delete note?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The note will be permanently removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => onDelete(note.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>
      <textarea
        className="flex-1 resize-none border-none bg-background p-6 font-mono text-sm leading-relaxed text-foreground outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  )
}

export function Inbox(): React.JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const fetchNotes = useCallback(async (): Promise<void> => {
    const result = await window.pilog.invoke('note:list')
    setNotes(result)
  }, [])

  useEffect(() => {
    let cancelled = false
    window.pilog.invoke('note:list').then((result) => {
      if (!cancelled) setNotes(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleNewNote = async (): Promise<void> => {
    const created = await window.pilog.invoke('note:create', {
      content: `New note – ${new Date().toLocaleString()}`
    })
    await fetchNotes()
    setSelectedId(created.id)
  }

  const handleSave = async (id: string, content: string): Promise<void> => {
    await window.pilog.invoke('note:update', { id, content })
    await fetchNotes()
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.pilog.invoke('note:delete', { id })
    setSelectedId(null)
    await fetchNotes()
  }

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null

  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="flex w-80 flex-col border-r">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <h1 className="text-xl font-semibold">Inbox</h1>
          <Button onClick={handleNewNote} size="sm">
            <Plus className="h-4 w-4" />
            New note
          </Button>
        </header>
        <nav className="flex-1 overflow-y-auto p-3">
          {notes.length === 0 ? (
            <p className="text-muted-foreground text-center mt-12 text-sm">
              No notes yet. Click &quot;+ New note&quot; to get started.
            </p>
          ) : (
            <ul className="space-y-1">
              {notes.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(note.id)}
                    className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${
                      note.id === selectedId
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-accent/50'
                    }`}
                  >
                    <p className="truncate text-sm">{note.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(note.createdAt).toLocaleString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </div>
      <div className="flex-1">
        {selectedNote ? (
          <NoteDetail
            key={selectedNote.id}
            note={selectedNote}
            onSave={handleSave}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground text-sm">
              Select a note to view and edit, or create a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
