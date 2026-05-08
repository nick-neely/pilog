import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Empty, EmptyDescription } from '@renderer/components/ui/empty'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Toggle } from '@renderer/components/ui/toggle'
import type {
  CreateIssueRequest,
  DetectLocalRepoResult,
  GitHubLabel,
  GitHubRepo,
  Repo
} from '@shared/ipc'

/** Readable foreground on arbitrary GitHub label hex (warm ink / parchment). */
function contrastLabelColor(hex: string): string {
  const n = parseInt(hex, 16)
  if (Number.isNaN(n)) return 'var(--foreground)'
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.55 ? 'oklch(0.22 0.012 60)' : 'oklch(0.97 0.005 75)'
}

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
      <Alert variant="destructive">
        <AlertDescription>
          Connect your GitHub account in Settings before adding a repository.
        </AlertDescription>
      </Alert>
    )
  }

  if (result.state === 'not-git') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span className="font-mono text-xs">{localPath}</span> is not a Git repository.
        </AlertDescription>
      </Alert>
    )
  }

  if (result.state === 'no-remote') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span className="font-mono text-xs">{localPath}</span> has no origin remote configured.
        </AlertDescription>
      </Alert>
    )
  }

  if (result.state === 'unmatched') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Remote <span className="font-mono text-xs">{result.remoteUrl}</span> does not match any
          GitHub repository visible to your account.
        </AlertDescription>
      </Alert>
    )
  }

  const { githubRepo, defaultBranch } = result
  return (
    <Card size="sm" className="shadow-none ring-1 ring-border">
      <CardContent className="flex flex-col gap-3 py-4">
        <div>
          <p className="text-sm font-medium">{githubRepo.fullName}</p>
          <p className="text-xs text-muted-foreground">
            Default branch: <span className="font-mono">{defaultBranch}</span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{localPath}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onConfirm(githubRepo, defaultBranch)}>
            Link repository
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
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
    <div className="flex flex-col gap-3">
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
        <div className="flex flex-col gap-3">
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

function NewIssueDialog({
  repo,
  open,
  onOpenChange
}: {
  repo: Repo
  open: boolean
  onOpenChange: (open: boolean) => void
}): React.JSX.Element {
  const [state, setState] = useState<NewIssueState>({
    step: 'open',
    labels: [],
    labelsLoading: true
  })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedLabels, setSelectedLabels] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setState({ step: 'open', labels: [], labelsLoading: true })
      setTitle('')
      setBody('')
      setSelectedLabels([])
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
    })
    return (): void => {
      cancelled = true
    }
  }, [open, repo.owner, repo.name])

  const handleSubmit = async (): Promise<void> => {
    if (state.step !== 'open' && state.step !== 'error') return
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

  const handleClose = (): void => {
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isSubmitting) return
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        showCloseButton={!isSubmitting && state.step !== 'success'}
        onEscapeKeyDown={(e) => isSubmitting && e.preventDefault()}
        onPointerDownOutside={(e) => isSubmitting && e.preventDefault()}
      >
        {state.step === 'success' ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-lg font-medium">Issue created</DialogTitle>
              <DialogDescription>
                Your issue has been published to GitHub and opened in your browser.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-heading text-lg font-medium">
                New issue — {repo.owner}/{repo.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Create a new GitHub issue from PiLog.
              </DialogDescription>
            </DialogHeader>

            {state.step === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor={`issue-title-${repo.id}`}>
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`issue-title-${repo.id}`}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSubmitting}
                placeholder="Short, descriptive title"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Body</Label>
              <MarkdownEditor onChange={setBody} disabled={isSubmitting} />
            </div>

            {labels.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Labels</span>
                <div className="flex flex-wrap gap-1.5">
                  {labels.map((label) => {
                    const selected = selectedLabels.includes(label.name)
                    return (
                      <Toggle
                        key={label.id}
                        pressed={selected}
                        onPressedChange={() => !isSubmitting && toggleLabel(label.name)}
                        disabled={isSubmitting}
                        size="sm"
                        title={label.description ?? undefined}
                        className="rounded-full border-0 px-2.5 py-0.5 text-xs font-medium opacity-90 hover:opacity-100 data-[state=on]:opacity-100 data-[state=on]:ring-2 data-[state=on]:ring-ring data-[state=on]:ring-offset-1"
                        style={{
                          backgroundColor: `#${label.color}`,
                          color: contrastLabelColor(label.color)
                        }}
                      >
                        {label.name}
                      </Toggle>
                    )
                  })}
                </div>
              </div>
            )}

            {state.step === 'open' && state.labelsLoading && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-full max-w-md" />
              </div>
            )}

            <DialogFooter className="gap-2 pt-1 sm:justify-end">
              <Button variant="ghost" size="sm" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={isSubmitting || !title.trim()}>
                {isSubmitting ? 'Publishing…' : 'Publish issue'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
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
      <Card size="sm" className="shadow-none ring-1 ring-border">
        <CardContent className="flex flex-row items-center justify-between gap-4 py-4">
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
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowNewIssue(true)}>
              New Issue
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onUnlink(repo.id)}>
              Remove
            </Button>
          </div>
        </CardContent>
      </Card>
      <NewIssueDialog repo={repo} open={showNewIssue} onOpenChange={setShowNewIssue} />
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
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onBack}>
          &larr; Back
        </Button>
        <h1 className="text-xl font-semibold">Repositories</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-lg flex-col gap-6">
          {repos.length > 0 && (
            <section className="flex flex-col gap-2">
              {repos.map((repo) => (
                <RepoRow key={repo.id} repo={repo} onUnlink={handleUnlink} />
              ))}
            </section>
          )}

          {repos.length === 0 && (
            <Empty className="border-none bg-transparent p-6 shadow-none">
              <EmptyDescription className="text-sm">
                No repositories linked yet. Add a local Git repository to get started.
              </EmptyDescription>
            </Empty>
          )}

          <section>
            <AddRepoFlow onLinked={reload} />
          </section>
        </div>
      </div>
    </div>
  )
}
