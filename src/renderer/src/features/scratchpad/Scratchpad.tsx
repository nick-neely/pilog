import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { Badge } from '@renderer/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import type { Repo } from '@shared/ipc'
import { cn } from '@renderer/lib/utils'
import { shouldSave } from '@shared/scratchpad'
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'

const NOTE_REPO_NONE = '__none__'

export function Scratchpad(): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const hasChangedRef = useRef(false)
  // Ref keeps save() stable (no dep on selectedRepoId state) while always
  // reading the current value. State drives the visible selector.
  const selectedRepoIdRef = useRef<string | null>(null)

  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)
  const [showSavedHint, setShowSavedHint] = useState(false)
  const savedHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    selectedRepoIdRef.current = selectedRepoId
  }, [selectedRepoId])

  // Load repos and last-used repo setting on mount
  useEffect(() => {
    Promise.all([
      window.pilog.invoke('repos:list'),
      window.pilog.invoke('setting:get', { key: 'scratchpad.lastRepoId' })
    ]).then(([repoList, lastRepoId]) => {
      setRepos(repoList)
      if (lastRepoId && repoList.some((r) => r.id === lastRepoId)) {
        setSelectedRepoId(lastRepoId)
        selectedRepoIdRef.current = lastRepoId
      }
    })
  }, [])

  const clearSavedHint = useCallback((): void => {
    if (savedHintTimeoutRef.current) {
      clearTimeout(savedHintTimeoutRef.current)
      savedHintTimeoutRef.current = null
    }
  }, [])

  const triggerSavedHint = useCallback((): void => {
    clearSavedHint()
    setShowSavedHint(true)
    savedHintTimeoutRef.current = setTimeout(() => {
      setShowSavedHint(false)
    }, 1500)
  }, [clearSavedHint])

  const save = useCallback(async (): Promise<boolean> => {
    const content = viewRef.current?.state.doc.toString() ?? ''
    if (shouldSave(content, hasChangedRef.current)) {
      const repoId = selectedRepoIdRef.current
      await window.pilog.invoke('note:create', { content, repoId })
      // Persist the last-used repo on every successful save
      await window.pilog.invoke('setting:set', {
        key: 'scratchpad.lastRepoId',
        value: repoId ?? ''
      })
      hasChangedRef.current = false
      triggerSavedHint()
      return true
    }
    return false
  }, [triggerSavedHint])

  const saveAndHide = useCallback(async (): Promise<void> => {
    const didSave = await save()
    // Brief pause so the saved hint registers before the window hides
    if (didSave) {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    window.pilog.send('scratchpad:hide')
  }, [save])

  const resetEditor = useCallback((): void => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: '' }
    })
    hasChangedRef.current = false
    view.focus()
  }, [])

  useEffect(() => {
    if (!editorRef.current) return

    const saveAndHideCommand = (): boolean => {
      void saveAndHide()
      return true
    }

    const state = EditorState.create({
      extensions: [
        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown(),
        EditorView.lineWrapping,
        keymap.of([
          { key: 'Escape', run: saveAndHideCommand },
          { key: 'Mod-Enter', run: saveAndHideCommand },
          { key: 'Mod-s', run: saveAndHideCommand, preventDefault: true }
        ]),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) hasChangedRef.current = true
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px'
          },
          '.cm-scroller': {
            padding: '16px',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'
          },
          '.cm-content': {
            caretColor: 'var(--color-foreground, #1a1a1a)'
          },
          '&.cm-focused .cm-cursor': {
            borderLeftColor: 'var(--color-foreground, #1a1a1a)'
          },
          '&.cm-focused': {
            outline: 'none'
          }
        })
      ]
    })

    const view = new EditorView({ state, parent: editorRef.current })
    viewRef.current = view
    view.focus()

    return () => view.destroy()
  }, [saveAndHide])

  const handleResetEditor = useEffectEvent(resetEditor)

  useEffect(() => window.pilog.on('scratchpad:reset', handleResetEditor), [])

  useEffect(() => {
    return () => {
      clearSavedHint()
    }
  }, [clearSavedHint])

  const handleRepoChange = (value: string): void => {
    setSelectedRepoId(value === NOTE_REPO_NONE ? null : value)
  }

  return (
    <div className="relative flex h-screen w-screen flex-col bg-background">
      {/* Own row so typing never runs underneath the repo control */}
      <header className="flex shrink-0 items-center justify-end gap-2 border-b border-border/60 bg-background px-3 py-2">
        {repos.length === 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="cursor-default font-normal opacity-50"
                aria-label="Link a repo first in Settings"
              >
                Link a repo first
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Link a repo first in Settings → Repositories</TooltipContent>
          </Tooltip>
        ) : (
          <Select value={selectedRepoId ?? NOTE_REPO_NONE} onValueChange={handleRepoChange}>
            <SelectTrigger
              aria-label="Repository for this note"
              size="sm"
              className="max-w-[min(100vw-2rem,16rem)] text-xs text-muted-foreground"
            >
              <SelectValue placeholder="No repo" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NOTE_REPO_NONE}>No repo</SelectItem>
                {repos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.owner}/{r.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </header>
      <div ref={editorRef} className="min-h-0 flex-1 overflow-hidden" />
      {/* Save hint — appears briefly after a successful save to confirm capture.
           Sits at the bottom edge, mono text, muted tone so it never competes
           with the editor body. Reduced-motion users see instant state. */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className={cn(
          'pointer-events-none absolute right-4 bottom-4 flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs text-muted-foreground',
          'transition-all duration-200 ease-[var(--ease-out-quart)] motion-reduce:transition-none motion-reduce:duration-0',
          showSavedHint ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
        )}
      >
        <span className="size-1.5 rounded-full bg-primary" aria-hidden />
        Saved
      </div>
    </div>
  )
}
