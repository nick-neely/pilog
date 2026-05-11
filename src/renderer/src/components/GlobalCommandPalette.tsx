import {
  Activity01Icon,
  Add01Icon,
  File01Icon,
  InboxIcon,
  Settings02Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@renderer/components/ui/badge'
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
import { shortcutBindingMeta } from '@renderer/shortcuts/pilog-hotkeys'
import { getShortcutHelpItems } from '@renderer/shortcuts/shortcut-help'
import type { Note, Repo } from '@shared/ipc'
import { SHORTCUT_CONTRACT } from '@shared/shortcuts'
import type { IssueDraftForReview } from '@shared/types'
import { useCallback, useEffect, useMemo, useState } from 'react'

const NOTE_STATUS_LABEL: Record<Note['status'], string> = {
  unprocessed: 'Unprocessed',
  drafted: 'Drafted',
  published: 'Published',
  dismissed: 'Dismissed'
}

const IS_MAC = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().includes('MAC')
const META_KEY = IS_MAC ? '⌘' : 'Ctrl'

function matchesQuery(query: string, text: string): boolean {
  return text.toLowerCase().includes(query)
}

function draftSearchText(draft: IssueDraftForReview): string {
  return [draft.title, draft.body, draft.labels.join(' '), draft.status, draft.confidence, draft.id]
    .filter(Boolean)
    .join(' ')
}

export function GlobalCommandPalette({
  open,
  onOpenChange,
  activeRoute,
  onCreateNote,
  onOpenInbox,
  onOpenDrafts,
  onOpenRunHistory,
  onOpenSettings,
  onOpenNote,
  onOpenDraft
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeRoute: string
  onCreateNote: () => void | Promise<void>
  onOpenInbox: () => void
  onOpenDrafts: () => void
  onOpenRunHistory: () => void
  onOpenSettings: () => void
  onOpenNote: (noteId: string) => void
  onOpenDraft: (draftId: string) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [drafts, setDrafts] = useState<IssueDraftForReview[]>([])
  const [repos, setRepos] = useState<Repo[]>([])

  const refresh = useCallback(async (): Promise<void> => {
    const [nextNotes, nextDrafts, nextRepos] = await Promise.all([
      window.pilog.invoke('note:list', undefined),
      window.pilog.invoke('issue-drafts:list', { status: 'all' }),
      window.pilog.invoke('repos:list')
    ])
    setNotes(nextNotes)
    setDrafts(nextDrafts)
    setRepos(nextRepos)
  }, [])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      void refresh()
    })
  }, [open, refresh])

  const setOpen = useCallback(
    (next: boolean): void => {
      onOpenChange(next)
      if (!next) setQuery('')
    },
    [onOpenChange]
  )

  const runCommand = useCallback(
    (action: () => void | Promise<void>): void => {
      setOpen(false)
      requestAnimationFrame(() => {
        void action()
      })
    },
    [setOpen]
  )

  const reposById = useMemo(() => new Map(repos.map((repo) => [repo.id, repo])), [repos])
  const normalizedQuery = query.trim().toLowerCase()
  const openInboxShortcut = shortcutBindingMeta(SHORTCUT_CONTRACT.openInbox).description
  const openDraftsShortcut = shortcutBindingMeta(SHORTCUT_CONTRACT.openDrafts).description
  const shortcutHelpItems = useMemo(() => getShortcutHelpItems(), [])

  const noteResults = useMemo(() => {
    if (!normalizedQuery) return []
    return notes
      .filter((note) => {
        const repo = note.repoId ? reposById.get(note.repoId) : null
        const repoLabel = repo ? `${repo.owner}/${repo.name}` : ''
        return matchesQuery(
          normalizedQuery,
          `${note.content} ${NOTE_STATUS_LABEL[note.status]} ${repoLabel} ${note.id}`
        )
      })
      .slice(0, 8)
  }, [normalizedQuery, notes, reposById])

  const draftResults = useMemo(() => {
    if (!normalizedQuery) return []
    return drafts
      .filter((draft) => matchesQuery(normalizedQuery, draftSearchText(draft)))
      .slice(0, 8)
  }, [drafts, normalizedQuery])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        data-testid="search-input"
        placeholder="Search notes, drafts, or commands..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nothing matches that yet.</CommandEmpty>

        {noteResults.length > 0 && (
          <>
            <CommandGroup heading="Notes">
              {noteResults.map((note) => {
                const preview = note.content.trim() || 'Untitled note'
                const repo = note.repoId ? reposById.get(note.repoId) : undefined
                const repoLabel = repo ? `${repo.owner}/${repo.name}` : ''
                return (
                  <CommandItem
                    key={note.id}
                    data-testid="palette-note-row"
                    value={`${note.content} ${preview} ${repoLabel} ${NOTE_STATUS_LABEL[note.status]} ${note.id}`}
                    onSelect={() => runCommand(() => onOpenNote(note.id))}
                    className="flex-col items-start gap-1 py-2"
                  >
                    <span className="line-clamp-2 w-full text-left">{preview}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-medium text-foreground/80">
                        {NOTE_STATUS_LABEL[note.status]}
                      </Badge>
                      {repo ? (
                        <span className="truncate font-mono">{repoLabel}</span>
                      ) : (
                        <span className="text-muted-foreground/80">Unassigned</span>
                      )}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {draftResults.length > 0 && (
          <>
            <CommandGroup heading="Drafts">
              {draftResults.map((draft) => (
                <CommandItem
                  key={draft.id}
                  data-testid="palette-draft-row"
                  value={draftSearchText(draft)}
                  onSelect={() => runCommand(() => onOpenDraft(draft.id))}
                  className="flex-col items-start gap-1 py-2"
                >
                  <span className="line-clamp-2 w-full text-left">{draft.title}</span>
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="font-medium text-foreground/80">
                      {draft.status}
                    </Badge>
                    <Badge variant="outline" className="font-normal">
                      {draft.confidence} confidence
                    </Badge>
                    {draft.labels.slice(0, 2).map((label) => (
                      <Badge key={label} variant="outline" className="font-normal">
                        {label}
                      </Badge>
                    ))}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        <CommandGroup heading="Commands">
          <CommandItem data-testid="cmd-new-note" onSelect={() => runCommand(onCreateNote)}>
            <HugeiconsIcon icon={Add01Icon} aria-hidden />
            <span>New note</span>
            <CommandShortcut>{META_KEY}N</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(onOpenInbox)}>
            <HugeiconsIcon icon={InboxIcon} aria-hidden />
            <span>Open inbox</span>
            <CommandShortcut>
              {activeRoute === 'inbox' ? 'active' : openInboxShortcut}
            </CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(onOpenDrafts)}>
            <HugeiconsIcon icon={File01Icon} aria-hidden />
            <span>Open drafts</span>
            <CommandShortcut>
              {activeRoute === 'draft-review' ? 'active' : openDraftsShortcut}
            </CommandShortcut>
          </CommandItem>
          <CommandItem data-testid="cmd-agent-runs" onSelect={() => runCommand(onOpenRunHistory)}>
            <HugeiconsIcon icon={Activity01Icon} aria-hidden />
            <span>Open run history</span>
          </CommandItem>
          <CommandItem data-testid="cmd-settings" onSelect={() => runCommand(onOpenSettings)}>
            <HugeiconsIcon icon={Settings02Icon} aria-hidden />
            <span>Settings</span>
            <CommandShortcut>{`${META_KEY},`}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Keyboard Shortcuts">
          {shortcutHelpItems.map((shortcut) => (
            <CommandItem
              key={shortcut.id}
              value={`${shortcut.label} ${shortcut.shortcut} ${shortcut.id}`}
              onSelect={() => undefined}
            >
              <span>{shortcut.label}</span>
              <CommandShortcut>{shortcut.shortcut}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
