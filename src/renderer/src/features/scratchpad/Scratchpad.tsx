import { useEffect, useRef, useCallback, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { shouldSave } from '@shared/scratchpad'
import type { Repo } from '@shared/ipc'

export function Scratchpad(): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const hasChangedRef = useRef(false)
  // Ref keeps save() stable (no dep on selectedRepoId state) while always
  // reading the current value. State drives the visible selector.
  const selectedRepoIdRef = useRef<string | null>(null)

  const [repos, setRepos] = useState<Repo[]>([])
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null)

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
      return true
    }
    return false
  }, [])

  const saveAndHide = useCallback(async (): Promise<void> => {
    await save()
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

    const saveCommand = (): boolean => {
      void save()
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
          { key: 'Mod-s', run: saveCommand, preventDefault: true }
        ]),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) hasChangedRef.current = true
        }),
        EditorView.theme({
          '&': {
            height: '100vh',
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
  }, [save, saveAndHide])

  useEffect(() => {
    return window.pilog.on('scratchpad:reset', resetEditor)
  }, [resetEditor])

  const handleRepoChange = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const value = e.target.value
    setSelectedRepoId(value || null)
  }

  return (
    <div className="relative h-screen w-screen bg-background">
      <div ref={editorRef} className="h-full w-full" />
      {/* Inline repo selector — top-right, compact, keyboard-reachable */}
      <div className="absolute top-2 right-2 z-10">
        {repos.length === 0 ? (
          <span
            aria-label="Link a repo first in Settings"
            title="Link a repo first in Settings → Repositories"
            className="cursor-default select-none rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground opacity-50"
          >
            Link a repo first
          </span>
        ) : (
          <select
            aria-label="Repository for this note"
            value={selectedRepoId ?? ''}
            onChange={handleRepoChange}
            className="rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/30"
          >
            <option value="">No repo</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.owner}/{r.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
