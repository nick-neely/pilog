import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { Button } from '@renderer/components/ui/button'
import type {
  CreateIssueRequest,
  DetectLocalRepoResult,
  GitHubLabel,
  GitHubRepo,
  Repo
} from '@shared/ipc'

function useRepos(): {
  repos: Repo[]
  reload: () => Promise<void>
} {
  const [repos, setRepos] = useState<Repo[]>([])

  const reload = useCallback(async () => {
    const list = await window.pilog.invoke('repos:list')
    setRepos(list)
  }, [])

  useEffect(() => {
    window.pilog.invoke('repos:list').then(setRepos)
  }, [])

  return { repos, reload }
}

type AddRepoState =
  | { step: 'idle' }
  | { step: 'detecting'; localPath: string }
  | { step: 'result'; localPath: string; result: DetectLocalRepoResult }
  | { step: 'linking' }

function DetectResultInline({
  localPath,
  result,
  onConfirm,
  onReset
}: {
  localPath: string
  result: DetectLocalRepoResult
  onConfirm: (githubRepo: GitHubRepo, defaultBranch: string) => void
  onReset: () => void
}): React.JSX.Element {
  if (result.state === 'unauthenticated') {
    return (
      <p className="text-sm text-destructive">
        Connect your GitHub account in Settings before adding a repository.
      </p>
    )
  }

  if (result.state === 'not-git') {
    return (
      <p className="text-sm text-destructive">
        <span className="font-mono text-xs">{localPath}</span> is not a Git repository.
      </p>
    )
  }

  if (result.state === 'no-remote') {
    return (
      <p className="text-sm text-destructive">
        <span className="font-mono text-xs">{localPath}</span> has no origin remote configured.
      </p>
    )
  }

  if (result.state === 'unmatched') {
    return (
      <p className="text-sm text-destructive">
        Remote <span className="font-mono text-xs">{result.remoteUrl}</span> does not match any
        GitHub repository visible to your account.
      </p>
    )
  }

  const { githubRepo, defaultBranch } = result
  return (
    <div className="space-y-3 rounded-md border px-4 py-3">
      <div>
        <p className="text-sm font-medium">{githubRepo.fullName}</p>
        <p className="text-xs text-muted-foreground">
          Default branch: <span className="font-mono">{defaultBranch}</span>
        </p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{localPath}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => onConfirm(githubRepo, defaultBranch)}>
          Link repository
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AddRepoFlow({ onLinked }: { onLinked: () => void }): React.JSX.Element {
  const [state, setState] = useState<AddRepoState>({ step: 'idle' })

  const handlePickDirectory = async (): Promise<void> => {
    const localPath = await window.pilog.invoke('dialog:openDirectory')
    if (!localPath) return

    setState({ step: 'detecting', localPath })
    const result = await window.pilog.invoke('repos:detectLocal', { localPath })
    setState({ step: 'result', localPath, result })
  }

  const handleConfirm = async (githubRepo: GitHubRepo, defaultBranch: string): Promise<void> => {
    if (state.step !== 'result') return
    setState({ step: 'linking' })
    await window.pilog.invoke('repos:link', {
      localPath: state.localPath,
      githubRepo,
      defaultBranch
    })
    setState({ step: 'idle' })
    onLinked()
  }

  const handleReset = (): void => setState({ step: 'idle' })

  if (state.step === 'linking') {
    return <p className="text-sm text-muted-foreground">Linking repository…</p>
  }

  return (
    <div className="space-y-3">
      {state.step === 'idle' && (
        <Button size="sm" onClick={handlePickDirectory}>
          Add local repo
        </Button>
      )}

      {state.step === 'detecting' && (
        <p className="text-sm text-muted-foreground">
          Detecting <span className="font-mono text-xs">{state.localPath}</span>…
        </p>
      )}

      {state.step === 'result' && (
        <div className="space-y-3">
          <DetectResultInline
            localPath={state.localPath}
            result={state.result}
            onConfirm={handleConfirm}
            onReset={handleReset}
          />
          {state.result.state !== 'matched' && (
            <Button size="sm" variant="ghost" onClick={handlePickDirectory}>
              Try a different directory
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

type NewIssueState =
  | { step: 'open'; labels: GitHubLabel[]; labelsLoading: boolean }
  | { step: 'submitting'; labels: GitHubLabel[] }
  | { step: 'success'; issueUrl: string }
  | { step: 'error'; labels: GitHubLabel[]; message: string }

function MarkdownEditor({
  onChange,
  disabled
}: {
  onChange: (value: string) => void
  disabled: boolean
}): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      extensions: [
        history(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdown(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
        EditorView.theme({
          '&': { fontSize: '13px', minHeight: '120px' },
          '.cm-scroller': {
            padding: '8px',
            fontFamily: 'var(--font-mono, monospace)'
          },
          '&.cm-focused': { outline: 'none' }
        })
      ]
    })

    const view = new EditorView({ state, parent: editorRef.current })
    viewRef.current = view

    return () => view.destroy()
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dom.style.pointerEvents = disabled ? 'none' : ''
    view.dom.style.opacity = disabled ? '0.5' : ''
  }, [disabled])

  return (
    <div
      ref={editorRef}
      className="rounded-md border bg-background text-sm focus-within:ring-1 focus-within:ring-ring"
    />
  )
}

function NewIssueModal({ repo, onClose }: { repo: Repo; onClose: () => void }): React.JSX.Element {
  const [state, setState] = useState<NewIssueState>({
    step: 'open',
    labels: [],
    labelsLoading: true
  })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    window.pilog
      .invoke('github:listLabels', {
        owner: repo.owner,
        repo: repo.name
      })
      .then((labels) => {
        if (!cancelled) setState({ step: 'open', labels, labelsLoading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ step: 'open', labels: [], labelsLoading: false })
      })
    return (): void => {
      cancelled = true
    }
  }, [repo.owner, repo.name])

  const handleSubmit = async (): Promise<void> => {
    if (state.step !== 'open' && state.step !== 'error') return
    // Capture labels before any async setState so TypeScript narrowing stays valid
    const capturedLabels = state.labels

    if (!title.trim()) return

    setState({ step: 'submitting', labels: capturedLabels })

    const request: CreateIssueRequest = {
      owner: repo.owner,
      repo: repo.name,
      repoId: repo.id,
      title: title.trim(),
      body,
      labels: selectedLabels.length > 0 ? selectedLabels : undefined
    }

    try {
      const result = await window.pilog.invoke('github:createIssue', request)
      setState({ step: 'success', issueUrl: result.url })
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create issue. Please try again.'
      setState({ step: 'error', labels: capturedLabels, message })
    }
  }

  const toggleLabel = (name: string): void => {
    setSelectedLabels((prev) =>
      prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name]
    )
  }

  const isSubmitting = state.step === 'submitting'
  const labels = state.step !== 'success' ? state.labels : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 dark:bg-background/70">
      <div className="w-full max-w-lg rounded-xl bg-popover p-6 text-popover-foreground shadow-xl ring-1 ring-foreground/5 dark:ring-foreground/10">
        {state.step === 'success' ? (
          <div className="space-y-4">
            <h2 className="font-heading text-lg font-medium">Issue created</h2>
            <p className="text-sm text-muted-foreground">
              Your issue has been published to GitHub and opened in your browser.
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-medium">
                New issue — {repo.owner}/{repo.name}
              </h2>
              <button
                onClick={onClose}
                disabled={isSubmitting}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                ✕
              </button>
            </div>

            {state.step === 'error' && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.message}
              </p>
            )}

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Title <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSubmitting}
                placeholder="Short, descriptive title"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Body
              </label>
              <MarkdownEditor onChange={setBody} disabled={isSubmitting} />
            </div>

            {labels.length > 0 && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Labels
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((label) => {
                    const selected = selectedLabels.includes(label.name)
                    return (
                      <button
                        key={label.id}
                        onClick={() => !isSubmitting && toggleLabel(label.name)}
                        disabled={isSubmitting}
                        title={label.description ?? undefined}
                        className={[
                          'rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity',
                          selected
                            ? 'ring-2 ring-ring ring-offset-1'
                            : 'opacity-60 hover:opacity-90',
                          'disabled:cursor-not-allowed'
                        ].join(' ')}
                        style={{
                          backgroundColor: `#${label.color}`,
                          color: parseInt(label.color, 16) > 0x888888 ? '#000' : '#fff'
                        }}
                      >
                        {label.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {state.step === 'open' && state.labelsLoading && (
              <p className="text-xs text-muted-foreground">Loading labels…</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={isSubmitting || !title.trim()}>
                {isSubmitting ? 'Publishing…' : 'Publish issue'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function RepoRow({
  repo,
  onUnlink
}: {
  repo: Repo
  onUnlink: (id: string) => void
}): React.JSX.Element {
  const [showNewIssue, setShowNewIssue] = useState(false)

  return (
    <>
      <div className="flex items-center justify-between rounded-md border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {repo.owner}/{repo.name}
          </p>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {repo.localPath}
          </p>
          {repo.defaultBranch && (
            <p className="text-xs text-muted-foreground">
              Branch: <span className="font-mono">{repo.defaultBranch}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowNewIssue(true)}>
            New Issue
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onUnlink(repo.id)}>
            Remove
          </Button>
        </div>
      </div>
      {showNewIssue && <NewIssueModal repo={repo} onClose={() => setShowNewIssue(false)} />}
    </>
  )
}

export function Repositories({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { repos, reload } = useRepos()

  const handleUnlink = async (id: string): Promise<void> => {
    await window.pilog.invoke('repos:unlink', { id })
    await reload()
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-xl font-semibold">Repositories</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg space-y-6">
          {repos.length > 0 && (
            <section className="space-y-2">
              {repos.map((repo) => (
                <RepoRow key={repo.id} repo={repo} onUnlink={handleUnlink} />
              ))}
            </section>
          )}

          {repos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No repositories linked yet. Add a local Git repository to get started.
            </p>
          )}

          <section>
            <AddRepoFlow onLinked={reload} />
          </section>
        </div>
      </div>
    </div>
  )
}
