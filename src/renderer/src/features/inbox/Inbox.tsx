import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import type { Note } from '@shared/ipc'

export function Inbox(): React.JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])

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
    await window.pilog.invoke('note:create', {
      content: `New note – ${new Date().toLocaleString()}`
    })
    const result = await window.pilog.invoke('note:list')
    setNotes(result)
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Inbox</h1>
        <Button onClick={handleNewNote} size="sm">
          <Plus className="h-4 w-4" />
          New note
        </Button>
      </header>
      <main className="flex-1 overflow-y-auto p-6">
        {notes.length === 0 ? (
          <p className="text-muted-foreground text-center mt-12">
            No notes yet. Click &quot;+ New note&quot; to get started.
          </p>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm"
              >
                <p className="text-sm">{note.content}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(note.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
