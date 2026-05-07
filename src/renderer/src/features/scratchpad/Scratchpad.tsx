import { useEffect, useRef, useCallback } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { shouldSave } from '@shared/scratchpad'

export function Scratchpad(): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const hasChangedRef = useRef(false)

  const save = useCallback(async (): Promise<boolean> => {
    const content = viewRef.current?.state.doc.toString() ?? ''
    if (shouldSave(content, hasChangedRef.current)) {
      await window.pilog.invoke('note:create', { content })
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

  return <div ref={editorRef} className="h-screen w-screen bg-background" />
}
