import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import {
  ArrowRight01Icon,
  CancelCircleIcon,
  Copy01Icon,
  FolderOpenIcon,
  GitMergeIcon,
  Tick02Icon,
  ViewIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Empty, EmptyDescription } from '@renderer/components/ui/empty'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { Separator } from '@renderer/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { extractAcceptanceCriteria, writeAcceptanceCriteria } from '@shared/acceptance-criteria'
import type { PathActionResult, Repo, UpdateIssueDraftRequest } from '@shared/ipc'
import type {
  IssueDraft,
  IssueDraftForReview,
  IssueDraftSourceNote,
  IssueDraftStatus
} from '@shared/types'

const EMPTY_STATUS_COUNTS: Record<IssueDraftStatus, number> = {
  draft: 0,
  dismissed: 0,
  published: 0
}

const ISSUE_DRAFT_STATUSES: readonly IssueDraftStatus[] = ['draft', 'dismissed', 'published']

const DRAFT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

function formatTimestamp(iso: string): string {
  return DRAFT_TIMESTAMP_FORMATTER.format(new Date(iso))
}

function formatLabels(labels: string[]): string {
  return labels.join(', ')
}

function parseLabels(value: string): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const part of value.split(',')) {
    const label = part.trim()
    if (!label || seen.has(label)) continue
    seen.add(label)
    labels.push(label)
  }
  return labels
}

function parseCriteriaLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim())
    .filter(Boolean)
}

function normalizeDraftTitle(title: string): string {
  return title.trim() || 'Untitled draft'
}

function hasDraftChanges(
  draft: IssueDraft,
  next: Pick<UpdateIssueDraftRequest, 'title' | 'body' | 'labels'>
): boolean {
  return (
    next.title !== draft.title ||
    next.body !== draft.body ||
    formatLabels(next.labels) !== formatLabels(draft.labels)
  )
}

function draftCardClassName(selected: boolean): string {
  return cn(
    'flex w-full min-w-0 flex-col rounded-md border px-3 py-3 text-left transition-colors',
    'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
    selected ? 'border-border bg-muted' : 'border-transparent hover:bg-muted/60'
  )
}

function confidenceLabel(confidence: IssueDraft['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'High confidence'
    case 'medium':
      return 'Medium confidence'
    case 'low':
      return 'Low confidence'
  }
}

type PathAction = 'copy' | 'reveal'

function pathActionChannel(action: PathAction): 'path:copy' | 'path:reveal' {
  switch (action) {
    case 'copy':
      return 'path:copy'
    case 'reveal':
      return 'path:reveal'
  }
}

function pathActionMessage(result: PathActionResult, action: PathAction): string {
  if (result.ok) {
    return action === 'copy' ? 'Copied path.' : 'Opened in file explorer.'
  }

  switch (result.reason) {
    case 'missing':
      return 'File was not found on disk.'
    case 'unavailable':
      return 'Could not use this path.'
  }
}

function statusLabel(status: IssueDraftStatus): string {
  switch (status) {
    case 'draft':
      return 'Active'
    case 'dismissed':
      return 'Dismissed'
    case 'published':
      return 'Published'
  }
}

function countDraftsByStatus(drafts: IssueDraft[]): Record<IssueDraftStatus, number> {
  const counts = { ...EMPTY_STATUS_COUNTS }
  for (const draft of drafts) {
    counts[draft.status] += 1
  }
  return counts
}

function emptyDraftDescription(
  statusFilter: IssueDraftStatus,
  statusCounts: Record<IssueDraftStatus, number>
): string {
  if (statusFilter !== 'draft') {
    return `No ${statusLabel(statusFilter).toLowerCase()} drafts.`
  }

  if (statusCounts.dismissed > 0) {
    return 'No active drafts. Dismissed drafts stay local and can be inspected from the Dismissed filter.'
  }

  return 'No active drafts yet. Generate drafts from selected inbox notes to review them here.'
}

function formatDraftCount(count: number, status: IssueDraftStatus): string {
  const label = statusLabel(status).toLowerCase()
  return `${count} ${label} draft${count === 1 ? '' : 's'}`
}

export function DraftReview({
  onOpenSourceNote
}: {
  onOpenSourceNote: (noteId: string) => void
}): React.JSX.Element {
  const [drafts, setDrafts] = useState<IssueDraftForReview[]>([])
  const [repos, setRepos] = useState<Repo[]>([])
  const [statusFilter, setStatusFilter] = useState<IssueDraftStatus>('draft')
  const [statusCounts, setStatusCounts] =
    useState<Record<IssueDraftStatus, number>>(EMPTY_STATUS_COUNTS)
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDrafts = useCallback(async (): Promise<void> => {
    const [allDrafts, repoResult] = await Promise.all([
      window.pilog.invoke('issue-drafts:list', { status: 'all' }),
      window.pilog.invoke('repos:list')
    ])
    const filteredDrafts = allDrafts.filter((draft) => draft.status === statusFilter)

    setDrafts(filteredDrafts)
    setRepos(repoResult)
    setStatusCounts(countDraftsByStatus(allDrafts))
    setSelectedDraftId((current) => {
      if (current && filteredDrafts.some((draft) => draft.id === current)) return current
      return filteredDrafts[0]?.id ?? null
    })
    setLoading(false)
  }, [statusFilter])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchDrafts()
    })
  }, [fetchDrafts])

  const handleDraftsInvalidated = useEffectEvent(() => {
    void fetchDrafts()
  })

  useEffect(() => window.pilog.on('issue-drafts:invalidated', handleDraftsInvalidated), [])

  const selectedDraft = drafts.find((draft) => draft.id === selectedDraftId) ?? null
  const mergeCandidates = useMemo(
    () =>
      selectedDraft
        ? drafts.filter(
            (draft) => draft.id !== selectedDraft.id && draft.repoId === selectedDraft.repoId
          )
        : [],
    [drafts, selectedDraft]
  )
  const reposById = useMemo(() => new Map(repos.map((repo) => [repo.id, repo])), [repos])
  const emptyDescription = emptyDraftDescription(statusFilter, statusCounts)

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-[27rem] min-w-0 shrink-0 flex-col overflow-hidden border-r">
        <div className="flex shrink-0 flex-col gap-3 border-b px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {loading ? 'Loading drafts' : formatDraftCount(drafts.length, statusFilter)}
            </p>
            <Badge variant="outline" className="shrink-0">
              Review queue
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-1" aria-label="Draft status filter">
            {ISSUE_DRAFT_STATUSES.map((status) => {
              const active = statusFilter === status
              return (
                <Button
                  key={status}
                  type="button"
                  variant={active ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 justify-between px-2"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(status)}
                >
                  <span>{statusLabel(status)}</span>
                  <span className="tabular font-mono text-xs text-muted-foreground">
                    {statusCounts[status]}
                  </span>
                </Button>
              )
            })}
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-3">
            {drafts.length === 0 ? (
              <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
                <EmptyDescription>{emptyDescription}</EmptyDescription>
                {statusFilter === 'draft' && statusCounts.dismissed > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setStatusFilter('dismissed')}
                  >
                    Show dismissed drafts
                  </Button>
                ) : null}
              </Empty>
            ) : (
              <ul className="flex flex-col gap-1">
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <button
                      type="button"
                      data-testid="draft-row"
                      onClick={() => setSelectedDraftId(draft.id)}
                      className={draftCardClassName(selectedDraftId === draft.id)}
                    >
                      <span className="flex min-w-0 items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="line-clamp-2 block text-sm font-medium">
                            {draft.title}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
                            {draft.body}
                          </span>
                        </span>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          aria-hidden
                          className="mt-0.5 shrink-0"
                        />
                      </span>

                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary">{statusLabel(draft.status)}</Badge>
                        <Badge variant="outline">{confidenceLabel(draft.confidence)}</Badge>
                        {draft.labels.slice(0, 3).map((label) => (
                          <Badge key={label} variant="outline">
                            {label}
                          </Badge>
                        ))}
                      </span>

                      <span className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {draft.groupingReason || 'No grouping reason recorded.'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ScrollBar />
        </ScrollArea>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {selectedDraft ? (
          <DraftEditor
            key={selectedDraft.id}
            draft={selectedDraft}
            mergeCandidates={mergeCandidates}
            repoPath={reposById.get(selectedDraft.repoId)?.localPath ?? null}
            onSaved={fetchDrafts}
            onOpenSourceNote={onOpenSourceNote}
            onStatusChanged={fetchDrafts}
          />
        ) : (
          <Empty className="h-full border-none bg-transparent shadow-none">
            <EmptyDescription>Select a draft to review and edit.</EmptyDescription>
          </Empty>
        )}
      </main>
    </div>
  )
}

function DraftEditor({
  draft,
  mergeCandidates,
  repoPath,
  onOpenSourceNote,
  onSaved,
  onStatusChanged
}: {
  draft: IssueDraftForReview
  mergeCandidates: IssueDraftForReview[]
  repoPath: string | null
  onOpenSourceNote: (noteId: string) => void
  onSaved: () => Promise<void>
  onStatusChanged: () => Promise<void>
}): React.JSX.Element {
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [labels, setLabels] = useState(formatLabels(draft.labels))
  const [criteria, setCriteria] = useState(extractAcceptanceCriteria(draft.body).join('\n'))
  const [saving, setSaving] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(draft.githubIssueUrl)
  const [pathMessages, setPathMessages] = useState<Record<string, string>>({})
  const [selectedMergeSourceId, setSelectedMergeSourceId] = useState<string>('')
  const [merging, setMerging] = useState(false)
  const [mergeMessage, setMergeMessage] = useState<string | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)

  const parsedLabels = useMemo(() => parseLabels(labels), [labels])
  const parsedCriteria = useMemo(() => parseCriteriaLines(criteria), [criteria])
  const bodyForSave = useMemo(
    () => writeAcceptanceCriteria(body, parsedCriteria),
    [body, parsedCriteria]
  )
  const editedDraft = useMemo(
    () => ({
      title: normalizeDraftTitle(title),
      body: bodyForSave,
      labels: parsedLabels
    }),
    [bodyForSave, parsedLabels, title]
  )
  const dirty = hasDraftChanges(draft, editedDraft)
  const isPublished = draft.status === 'published'
  const canPublish = draft.status === 'draft'
  const canMerge = draft.status === 'draft' && mergeCandidates.length > 0
  const mergeSourceId = mergeCandidates.some((candidate) => candidate.id === selectedMergeSourceId)
    ? selectedMergeSourceId
    : (mergeCandidates[0]?.id ?? '')

  const handleSave = useCallback(async (): Promise<void> => {
    if (!dirty || saving || isPublished) return
    setSaving(true)
    try {
      const updated = await window.pilog.invoke('issue-drafts:update', {
        id: draft.id,
        title: editedDraft.title,
        body: bodyForSave,
        labels: parsedLabels
      })
      if (updated) {
        setTitle(updated.title)
        setBody(updated.body)
        setLabels(formatLabels(updated.labels))
        setCriteria(extractAcceptanceCriteria(updated.body).join('\n'))
        setSavedAt(formatTimestamp(updated.updatedAt))
        await onSaved()
      }
    } finally {
      setSaving(false)
    }
  }, [bodyForSave, dirty, draft.id, editedDraft.title, isPublished, onSaved, parsedLabels, saving])

  const handlePublish = useCallback(async (): Promise<void> => {
    if (publishing || saving || !canPublish) return

    setPublishing(true)
    setPublishError(null)
    try {
      const published = await window.pilog.invoke('issue-drafts:publish', {
        id: draft.id,
        title: editedDraft.title,
        body: editedDraft.body,
        labels: editedDraft.labels
      })
      setTitle(published.title)
      setBody(published.body)
      setLabels(formatLabels(published.labels))
      setCriteria(extractAcceptanceCriteria(published.body).join('\n'))
      setSavedAt(formatTimestamp(published.updatedAt))
      setPublishedUrl(published.githubIssueUrl)
      await onSaved()
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed. Please try again.')
    } finally {
      setPublishing(false)
    }
  }, [canPublish, draft.id, editedDraft, onSaved, publishing, saving])

  const handleStatusChange = useCallback(
    async (status: IssueDraftStatus): Promise<void> => {
      if (updatingStatus || publishing || draft.status === status) return
      setUpdatingStatus(true)
      try {
        await window.pilog.invoke('issue-drafts:updateStatus', {
          id: draft.id,
          status
        })
      } finally {
        setUpdatingStatus(false)
      }
      await onStatusChanged()
    },
    [draft.id, draft.status, onStatusChanged, publishing, updatingStatus]
  )

  const handleMerge = useCallback(async (): Promise<void> => {
    if (!mergeSourceId || merging || saving || publishing || !canMerge) return

    setMerging(true)
    setMergeError(null)
    setMergeMessage(null)
    try {
      if (dirty) {
        await window.pilog.invoke('issue-drafts:update', {
          id: draft.id,
          title: editedDraft.title,
          body: editedDraft.body,
          labels: editedDraft.labels
        })
      }

      const merged = await window.pilog.invoke('issue-drafts:merge', {
        targetId: draft.id,
        sourceId: mergeSourceId
      })

      if (merged) {
        setTitle(merged.title)
        setBody(merged.body)
        setLabels(formatLabels(merged.labels))
        setCriteria(extractAcceptanceCriteria(merged.body).join('\n'))
        setSavedAt(formatTimestamp(merged.updatedAt))
        setMergeMessage('Merged into this draft. The other draft was moved to Dismissed.')
        await onSaved()
      }
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Merge failed. Please try again.')
    } finally {
      setMerging(false)
    }
  }, [
    canMerge,
    dirty,
    draft.id,
    editedDraft.body,
    editedDraft.labels,
    editedDraft.title,
    mergeSourceId,
    merging,
    onSaved,
    publishing,
    saving
  ])

  const handleSaveShortcut = useEffectEvent(() => {
    if (dirty && !saving) void handleSave()
  })

  const handlePathAction = useCallback(
    async (file: IssueDraft['affectedFiles'][number], action: PathAction): Promise<void> => {
      const result = await window.pilog.invoke(pathActionChannel(action), {
        path: file.path,
        repoPath
      })

      setPathMessages((current) => ({ ...current, [file.path]: pathActionMessage(result, action) }))
    },
    [repoPath]
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      event.preventDefault()
      handleSaveShortcut()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <article className="mx-auto flex min-h-full max-w-5xl flex-col">
      <header className="shrink-0 border-b px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="tabular font-mono text-xs text-muted-foreground">
              Updated {formatTimestamp(draft.updatedAt)}
            </p>
            <h2 className="mt-1 font-heading text-2xl font-medium tracking-tight">Draft Review</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {savedAt ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HugeiconsIcon icon={Tick02Icon} aria-hidden />
                Saved {savedAt}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={publishing || saving || !canPublish}
              onClick={() => void handlePublish()}
            >
              <HugeiconsIcon icon={ViewIcon} data-icon="inline-start" aria-hidden />
              {publishing ? 'Publishing' : isPublished ? 'Published' : 'Publish'}
            </Button>
            {draft.status === 'dismissed' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={updatingStatus}
                onClick={() => void handleStatusChange('draft')}
              >
                <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" aria-hidden />
                Restore
              </Button>
            ) : draft.status === 'draft' ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={updatingStatus}
                onClick={() => void handleStatusChange('dismissed')}
              >
                <HugeiconsIcon icon={CancelCircleIcon} data-icon="inline-start" aria-hidden />
                Dismiss
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              disabled={!dirty || saving || publishing || isPublished}
              onClick={() => void handleSave()}
            >
              <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" aria-hidden />
              {saving ? 'Saving' : 'Save'}
            </Button>
          </div>
        </div>
        {publishError ? (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-destructive" role="alert">
            {publishError}
          </p>
        ) : null}
        {publishedUrl ? (
          <p
            className="mt-3 max-w-2xl truncate font-mono text-xs text-muted-foreground"
            aria-live="polite"
          >
            Published to {publishedUrl}
          </p>
        ) : null}
      </header>

      <div className="grid flex-1 gap-8 px-8 py-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <form className="flex min-w-0 flex-col gap-5" onSubmit={(event) => event.preventDefault()}>
          <div className="flex flex-col gap-2">
            <label htmlFor="draft-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="draft-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Draft title"
              disabled={isPublished}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="draft-labels" className="text-sm font-medium">
              Labels
            </label>
            <Input
              id="draft-labels"
              value={labels}
              onChange={(event) => setLabels(event.target.value)}
              aria-describedby="draft-labels-help"
              disabled={isPublished}
            />
            <p id="draft-labels-help" className="text-xs text-muted-foreground">
              Separate labels with commas.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="draft-body" className="text-sm font-medium">
                Body
              </label>
              <Textarea
                id="draft-body"
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-96 font-mono text-sm leading-relaxed"
                disabled={isPublished}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-2">
              <label htmlFor="draft-criteria" className="text-sm font-medium">
                Acceptance Criteria
              </label>
              <Textarea
                id="draft-criteria"
                value={criteria}
                onChange={(event) => setCriteria(event.target.value)}
                className="min-h-96 font-mono text-sm leading-relaxed"
                aria-describedby="draft-criteria-help"
                disabled={isPublished}
              />
              <p id="draft-criteria-help" className="text-xs text-muted-foreground">
                One item per line. Saving writes this list back into the markdown body.
              </p>
            </div>
          </div>
        </form>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Readiness</h3>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{statusLabel(draft.status)}</Badge>
              <Badge variant="outline">{confidenceLabel(draft.confidence)}</Badge>
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Grouping Reason</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {draft.groupingReason || 'No grouping reason recorded.'}
            </p>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Source Notes</h3>
            <SourceNotesList draft={draft} onOpenSourceNote={onOpenSourceNote} />
          </section>

          <Separator />

          <MergeDraftSection
            draft={draft}
            mergeCandidates={mergeCandidates}
            mergeSourceId={mergeSourceId}
            merging={merging}
            mergeMessage={mergeMessage}
            mergeError={mergeError}
            saving={saving}
            publishing={publishing}
            onMergeSourceChange={setSelectedMergeSourceId}
            onMerge={handleMerge}
          />

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Affected Files</h3>
            {draft.affectedFiles.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {draft.affectedFiles.map((file) => (
                  <li
                    key={`${file.path}:${file.reason}`}
                    className="min-w-0 rounded-md border bg-muted/30 p-2"
                  >
                    <p className="break-all font-mono text-xs">{file.path}</p>
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {file.reason}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => void handlePathAction(file, 'copy')}
                      >
                        <HugeiconsIcon icon={Copy01Icon} data-icon="inline-start" aria-hidden />
                        Copy
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => void handlePathAction(file, 'reveal')}
                      >
                        <HugeiconsIcon icon={FolderOpenIcon} data-icon="inline-start" aria-hidden />
                        Reveal
                      </Button>
                    </div>
                    {pathMessages[file.path] ? (
                      <p className="mt-1 text-xs text-muted-foreground" role="status">
                        {pathMessages[file.path]}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No affected files recorded.</p>
            )}
          </section>
        </aside>
      </div>
    </article>
  )
}

function MergeDraftSection({
  draft,
  mergeCandidates,
  mergeSourceId,
  merging,
  mergeMessage,
  mergeError,
  saving,
  publishing,
  onMergeSourceChange,
  onMerge
}: {
  draft: IssueDraftForReview
  mergeCandidates: IssueDraftForReview[]
  mergeSourceId: string
  merging: boolean
  mergeMessage: string | null
  mergeError: string | null
  saving: boolean
  publishing: boolean
  onMergeSourceChange: (sourceId: string) => void
  onMerge: () => Promise<void>
}): React.JSX.Element {
  const canChooseSource = draft.status === 'draft' && mergeCandidates.length > 0
  const unavailableMessage =
    draft.status === 'draft'
      ? 'No other active drafts are available in this repo.'
      : 'Only active drafts can be merged.'

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Merge Draft</h3>
      {canChooseSource ? (
        <div className="flex flex-col gap-2">
          <Select value={mergeSourceId} onValueChange={onMergeSourceChange}>
            <SelectTrigger className="w-full rounded-md" aria-label="Draft to merge">
              <SelectValue placeholder="Choose a draft" />
            </SelectTrigger>
            <SelectContent className="rounded-md">
              <SelectGroup>
                {mergeCandidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id} className="rounded-md">
                    {candidate.title}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs leading-relaxed text-muted-foreground">
            This saves current edits, appends the chosen draft, unions notes, labels, and files,
            then moves the other draft to Dismissed.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!mergeSourceId || merging || saving || publishing}
            onClick={() => void onMerge()}
          >
            <HugeiconsIcon icon={GitMergeIcon} data-icon="inline-start" aria-hidden />
            {merging ? 'Merging' : 'Merge into this draft'}
          </Button>
          {mergeMessage ? (
            <p className="text-xs leading-relaxed text-muted-foreground" role="status">
              {mergeMessage}
            </p>
          ) : null}
          {mergeError ? (
            <p className="text-xs leading-relaxed text-destructive" role="alert">
              {mergeError}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{unavailableMessage}</p>
      )}
    </section>
  )
}

function SourceNotesList({
  draft,
  onOpenSourceNote
}: {
  draft: IssueDraftForReview
  onOpenSourceNote: (noteId: string) => void
}): React.JSX.Element {
  const sourceNotesById = new Map(draft.sourceNotes.map((note) => [note.id, note]))

  if (draft.sourceNoteIds.length === 0) {
    return <p className="text-sm text-muted-foreground">No source notes recorded.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {draft.sourceNoteIds.map((id) => {
        const note = sourceNotesById.get(id)
        return note ? (
          <SourceNoteItem key={id} note={note} onOpenSourceNote={onOpenSourceNote} />
        ) : (
          <li key={id} className="rounded-md border bg-muted/30 p-2">
            <p className="font-mono text-xs text-muted-foreground">{id}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Source note is no longer available.
            </p>
          </li>
        )
      })}
    </ul>
  )
}

function SourceNoteItem({
  note,
  onOpenSourceNote
}: {
  note: IssueDraftSourceNote
  onOpenSourceNote: (noteId: string) => void
}): React.JSX.Element {
  const preview = note.content.trim() || 'Untitled note'

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenSourceNote(note.id)}
        className={cn(
          'flex w-full min-w-0 flex-col rounded-md border bg-muted/30 p-2 text-left transition-colors',
          'hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30'
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{note.status}</Badge>
          <span className="tabular text-xs text-muted-foreground">
            {formatTimestamp(note.createdAt)}
          </span>
          <span className="truncate font-mono text-xs text-muted-foreground">
            {note.id.slice(0, 8)}
          </span>
        </span>
        <span className="mt-2 line-clamp-4 text-sm leading-relaxed">{preview}</span>
      </button>
    </li>
  )
}
