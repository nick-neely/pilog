import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowUp01Icon,
  RepositoryIcon,
  Tick02Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
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
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Separator } from '@renderer/components/ui/separator'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Switch } from '@renderer/components/ui/switch'
import { Toggle } from '@renderer/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import type {
  CreateIssueRequest,
  GitHubLabel,
  GitHubIssueTemplate,
  Repo,
  RepoAutoPublishSettings,
  UpdateRepoAutoPublishSettingsRequest
} from '@shared/ipc'
import { DEFAULT_REPO_AUTO_PUBLISH_SETTINGS, normalizeRepoAutoPublishSettings } from '@shared/ipc'
import { getRepoIndexStatusLabel } from './repo-index-status'
import { formatRepoLocation } from '@shared/repo-paths'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../recovery-state'
import { RepoLinkFlow } from '../setup/RepoLinkFlow'

/** `#rrggbb` for inline swatch, or neutral fallback if GitHub sends an odd value */
function githubLabelHex(color: string): string | undefined {
  const hex = color.replace(/^#/, '')
  return /^[0-9a-fA-F]{6}$/.test(hex) ? `#${hex}` : undefined
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

type NewIssueState =
  | { step: 'open'; labels: GitHubLabel[]; labelsLoading: boolean }
  | { step: 'submitting'; labels: GitHubLabel[] }
  | { step: 'success'; issueUrl: string }
  | { step: 'error'; labels: GitHubLabel[]; message: string }

function MarkdownEditor({
  value,
  onChange,
  disabled
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
}): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const initialValueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!editorRef.current) return

    const state = EditorState.create({
      doc: initialValueRef.current,
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
    const currentValue = view.state.doc.toString()
    if (currentValue === value) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dom.style.cssText = disabled ? 'pointer-events: none; opacity: 0.5;' : ''
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
  const [issueTemplate, setIssueTemplate] = useState<GitHubIssueTemplate | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setState({ step: 'open', labels: [], labelsLoading: true })
      setTitle('')
      setBody('')
      setSelectedLabels([])
      setIssueTemplate(null)
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
      window.pilog
        .invoke('repos:getDefaultIssueTemplate', { id: repo.id })
        .then((template) => {
          if (cancelled || !template) return
          setIssueTemplate(template)
          setBody(template.body)
          if (template.title) setTitle(template.title)
        })
        .catch(() => {
          if (!cancelled) setIssueTemplate(null)
        })
    })
    return (): void => {
      cancelled = true
    }
  }, [open, repo.id, repo.owner, repo.name])

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
      const message = getErrorMessage(err, 'Failed to create issue. Please try again.')
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
                New issue: {repo.owner}/{repo.name}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Create a new GitHub issue from Pilog.
              </DialogDescription>
            </DialogHeader>

            {state.step === 'error' && (
              <Alert variant="destructive">
                <AlertDescription>{state.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col gap-4">
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
                <div className="flex items-center justify-between gap-3">
                  <Label>Body</Label>
                  {issueTemplate ? (
                    <span className="truncate text-xs text-muted-foreground">
                      Template: {issueTemplate.name}
                    </span>
                  ) : null}
                </div>
                <MarkdownEditor value={body} onChange={setBody} disabled={isSubmitting} />
              </div>

              {labels.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <span
                      className="text-sm font-medium leading-none"
                      id={`issue-labels-${repo.id}`}
                    >
                      Labels
                    </span>
                    <p className="text-xs leading-snug text-muted-foreground">
                      Toggle any that apply. Selected labels show a check; repo colors appear as
                      dots.
                    </p>
                  </div>
                  <div
                    role="group"
                    aria-labelledby={`issue-labels-${repo.id}`}
                    className="flex flex-wrap gap-2"
                  >
                    {labels.map((label) => {
                      const selected = selectedLabels.includes(label.name)
                      const swatch = githubLabelHex(label.color)
                      const toggle = (
                        <Toggle
                          pressed={selected}
                          onPressedChange={() => !isSubmitting && toggleLabel(label.name)}
                          disabled={isSubmitting}
                          variant="outline"
                          size="sm"
                          aria-label={
                            selected ? `${label.name}, selected` : `${label.name}, not selected`
                          }
                          className={cn(
                            'h-auto min-h-8 shrink-0 rounded-md px-2.5 py-1.5 text-xs font-normal transition-colors',
                            'justify-start gap-2 border-border bg-background hover:bg-muted/70',
                            'data-[state=on]:border-primary data-[state=on]:bg-muted data-[state=on]:text-foreground'
                          )}
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            <HugeiconsIcon
                              icon={Tick02Icon}
                              strokeWidth={2}
                              aria-hidden
                              className={cn(
                                'size-3.5 text-primary transition-opacity',
                                selected ? 'opacity-100' : 'opacity-0'
                              )}
                            />
                          </span>
                          <span
                            className={cn(
                              'size-2.5 shrink-0 rounded-full ring-1 ring-foreground/15',
                              !swatch && 'bg-muted-foreground/35'
                            )}
                            style={swatch ? { backgroundColor: swatch } : undefined}
                            aria-hidden
                          />
                          <span className="min-w-0 text-left">{label.name}</span>
                        </Toggle>
                      )
                      return (
                        <Fragment key={label.id}>
                          {label.description ? (
                            <Tooltip>
                              <TooltipTrigger asChild>{toggle}</TooltipTrigger>
                              <TooltipContent>{label.description}</TooltipContent>
                            </Tooltip>
                          ) : (
                            toggle
                          )}
                        </Fragment>
                      )
                    })}
                  </div>
                </div>
              )}

              {state.step === 'open' && state.labelsLoading && (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-full max-w-sm" />
                  <div className="flex flex-wrap gap-2">
                    <Skeleton className="h-8 w-24 rounded-md" />
                    <Skeleton className="h-8 w-20 rounded-md" />
                    <Skeleton className="h-8 w-28 rounded-md" />
                    <Skeleton className="h-8 w-[4.5rem] rounded-md" />
                  </div>
                </div>
              )}
            </div>

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

function AutoPublishSettings({
  repo,
  onUpdated
}: {
  repo: Repo
  onUpdated: () => void
}): React.JSX.Element {
  const [enabled, setEnabled] = useState(repo.autoPublishEnabled)
  const [maxIssues, setMaxIssues] = useState(String(repo.autoPublishMaxIssuesPerRun))
  const [defaultLabel, setDefaultLabel] = useState(repo.autoPublishDefaultLabel)
  const [dryRun, setDryRun] = useState(repo.autoPublishDryRun)
  const [requireConfirmation, setRequireConfirmation] = useState(
    repo.autoPublishRequireConfirmation
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const formSettings: RepoAutoPublishSettings = normalizeRepoAutoPublishSettings({
    autoPublishEnabled: enabled,
    autoPublishMaxIssuesPerRun: Number.parseInt(maxIssues, 10),
    autoPublishDefaultLabel: defaultLabel,
    autoPublishDryRun: dryRun,
    autoPublishRequireConfirmation: requireConfirmation
  })
  const isDirty =
    formSettings.autoPublishEnabled !== repo.autoPublishEnabled ||
    formSettings.autoPublishMaxIssuesPerRun !== repo.autoPublishMaxIssuesPerRun ||
    formSettings.autoPublishDefaultLabel !== repo.autoPublishDefaultLabel ||
    formSettings.autoPublishDryRun !== repo.autoPublishDryRun ||
    formSettings.autoPublishRequireConfirmation !== repo.autoPublishRequireConfirmation

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setMessage(null)
    const request: UpdateRepoAutoPublishSettingsRequest = {
      id: repo.id,
      ...formSettings
    }
    const updated = await window.pilog.invoke('repos:updateAutoPublishSettings', request)
    setSaving(false)
    if (!updated) {
      setMessage('Repository settings could not be saved.')
      return
    }
    onUpdated()
    setMessage('Auto-publish settings saved.')
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex max-w-[36rem] flex-col gap-1">
          <p className="text-sm font-medium">Auto-publish guardrails</p>
          <p className="text-sm leading-6 text-muted-foreground">
            Applies only to {repo.owner}/{repo.name}. Pilog will use these limits before any
            generated issue can be written to GitHub.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Label htmlFor={`auto-publish-enabled-${repo.id}`} className="text-sm">
            {enabled ? 'Enabled' : 'Disabled'}
          </Label>
          <Switch
            id={`auto-publish-enabled-${repo.id}`}
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label={`Auto-publish for ${repo.owner}/${repo.name}`}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`auto-publish-max-${repo.id}`}>Max issues per run</Label>
          <Input
            id={`auto-publish-max-${repo.id}`}
            type="number"
            min={1}
            max={50}
            inputMode="numeric"
            value={maxIssues}
            onChange={(event) => setMaxIssues(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`auto-publish-label-${repo.id}`}>Default label</Label>
          <Input
            id={`auto-publish-label-${repo.id}`}
            type="text"
            value={defaultLabel}
            onChange={(event) => setDefaultLabel(event.target.value)}
            placeholder={DEFAULT_REPO_AUTO_PUBLISH_SETTINGS.autoPublishDefaultLabel}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label
          htmlFor={`auto-publish-dry-run-${repo.id}`}
          className="flex cursor-pointer items-start justify-between gap-3 rounded-md bg-muted/40 p-3"
        >
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium">Dry run</span>
            <span className="text-xs leading-5 text-muted-foreground">
              Generate the publish plan without creating GitHub issues.
            </span>
          </span>
          <Switch
            id={`auto-publish-dry-run-${repo.id}`}
            checked={dryRun}
            onCheckedChange={setDryRun}
            size="sm"
          />
        </label>

        <label
          htmlFor={`auto-publish-confirm-${repo.id}`}
          className="flex cursor-pointer items-start justify-between gap-3 rounded-md bg-muted/40 p-3"
        >
          <span className="flex flex-col gap-1">
            <span className="text-sm font-medium">Require confirmation</span>
            <span className="text-xs leading-5 text-muted-foreground">
              Show the planned drafts before Pilog writes to GitHub.
            </span>
          </span>
          <Switch
            id={`auto-publish-confirm-${repo.id}`}
            checked={requireConfirmation}
            onCheckedChange={setRequireConfirmation}
            size="sm"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {message ??
            `Defaults are disabled, ${DEFAULT_REPO_AUTO_PUBLISH_SETTINGS.autoPublishMaxIssuesPerRun} issues, ${DEFAULT_REPO_AUTO_PUBLISH_SETTINGS.autoPublishDefaultLabel}, confirmation on.`}
        </p>
        <Button size="sm" variant="outline" onClick={handleSave} disabled={!isDirty || saving}>
          {saving ? 'Saving…' : 'Save guardrails'}
        </Button>
      </div>
    </div>
  )
}

function RepoRow({
  repo,
  onUnlink,
  onUpdated
}: {
  repo: Repo
  onUnlink: (id: string) => void
  onUpdated: () => void
}): React.JSX.Element {
  const [showNewIssue, setShowNewIssue] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const hasGuardrails =
    repo.autoPublishEnabled ||
    repo.autoPublishMaxIssuesPerRun !==
      DEFAULT_REPO_AUTO_PUBLISH_SETTINGS.autoPublishMaxIssuesPerRun ||
    repo.autoPublishDefaultLabel !== DEFAULT_REPO_AUTO_PUBLISH_SETTINGS.autoPublishDefaultLabel ||
    repo.autoPublishDryRun ||
    !repo.autoPublishRequireConfirmation
  const repoLocation = formatRepoLocation(repo)
  const repoIndexStatus = getRepoIndexStatusLabel(repo.repoIndex ?? null)

  return (
    <>
      <div className="rounded-md border border-border">
        {/* Compact repo header — scannable at a glance */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {repo.owner}/{repo.name}
              </span>
              {repo.autoPublishEnabled ? (
                <Badge variant="default" className="h-4 px-1.5 text-[10px]">
                  Auto-publish on
                </Badge>
              ) : hasGuardrails ? (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
                  Custom
                </Badge>
              ) : null}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {repoLocation.label}
                </p>
              </TooltipTrigger>
              <TooltipContent className="max-w-lg whitespace-pre-wrap font-mono">
                {repoLocation.tooltipText}
              </TooltipContent>
            </Tooltip>
            {repo.defaultBranch && (
              <p className="text-xs text-muted-foreground">
                Branch: <span className="font-mono">{repo.defaultBranch}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground" aria-label={repoIndexStatus.ariaLabel}>
              Repo Index: <span className="text-foreground">{repoIndexStatus.label}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => setShowNewIssue(true)}>
              New Issue
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onUnlink(repo.id)}>
              Remove
            </Button>
          </div>
        </div>

        {/* Collapsible guardrails — progressive disclosure */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="font-medium">Auto-publish guardrails</span>
              <HugeiconsIcon
                icon={settingsOpen ? ArrowUp01Icon : ArrowDown01Icon}
                strokeWidth={2}
                className="size-3.5 shrink-0"
                aria-hidden
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t border-border px-4 pb-4">
              <AutoPublishSettings key={repo.updatedAt} repo={repo} onUpdated={onUpdated} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      <NewIssueDialog repo={repo} open={showNewIssue} onOpenChange={setShowNewIssue} />
    </>
  )
}

export function Repositories({
  onBack,
  onNavigateSettings
}: {
  onBack: () => void
  onNavigateSettings: () => void
}): React.JSX.Element {
  const { repos, reload } = useRepos()

  const handleUnlink = async (id: string): Promise<void> => {
    await window.pilog.invoke('repos:unlink', { id })
    await reload()
  }

  const handleRepoUpdated = (): void => {
    void reload()
  }

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 border-b px-6 py-4">
        <Button variant="ghost" size="icon" className="size-8" onClick={onBack} aria-label="Back">
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} className="size-4" aria-hidden />
        </Button>
        <div className="flex items-center gap-2">
          <HugeiconsIcon
            icon={RepositoryIcon}
            strokeWidth={2}
            className="size-5 text-muted-foreground"
            aria-hidden
          />
          <h1 className="font-heading text-xl font-medium">Repositories</h1>
        </div>
        {repos.length > 0 && (
          <Badge variant="secondary" className="ml-1 tabular">
            {repos.length}
          </Badge>
        )}
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
          {repos.length > 0 && (
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">Linked repositories</h2>
              </div>
              <div className="flex flex-col gap-3">
                {repos.map((repo) => (
                  <RepoRow
                    key={repo.id}
                    repo={repo}
                    onUnlink={handleUnlink}
                    onUpdated={handleRepoUpdated}
                  />
                ))}
              </div>
            </section>
          )}

          {repos.length === 0 && (
            <Empty className="border-none bg-transparent py-12 shadow-none">
              <EmptyDescription className="text-sm">
                No repositories linked yet. Add a local Git repository to get started.
              </EmptyDescription>
            </Empty>
          )}

          <Separator />

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-muted-foreground">Add repository</h2>
            <RepoLinkFlow
              onLinked={reload}
              onGitHubRequired={onNavigateSettings}
              githubRequiredLabel="Open Settings"
            />
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
