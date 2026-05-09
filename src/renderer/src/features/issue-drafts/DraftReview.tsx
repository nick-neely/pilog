import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { ArrowRight01Icon, Tick02Icon, ViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Empty, EmptyDescription } from '@renderer/components/ui/empty'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { Separator } from '@renderer/components/ui/separator'
import { Textarea } from '@renderer/components/ui/textarea'
import { cn } from '@renderer/lib/utils'
import { extractAcceptanceCriteria, writeAcceptanceCriteria } from '@shared/acceptance-criteria'
import type { UpdateIssueDraftRequest } from '@shared/ipc'
import type { IssueDraft } from '@shared/types'

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

export function DraftReview(): React.JSX.Element {
  const [drafts, setDrafts] = useState<IssueDraft[]>([])
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchDrafts = useCallback(async (): Promise<void> => {
    const result = await window.pilog.invoke('issue-drafts:list')
    setDrafts(result)
    setSelectedDraftId((current) => {
      if (current && result.some((draft) => draft.id === current)) return current
      return result[0]?.id ?? null
    })
    setLoading(false)
  }, [])

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

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-[27rem] min-w-0 shrink-0 flex-col overflow-hidden border-r">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
          <p className="text-sm text-muted-foreground">
            {loading ? 'Loading drafts' : `${drafts.length} draft${drafts.length === 1 ? '' : 's'}`}
          </p>
          <Badge variant="outline" className="shrink-0">
            Review queue
          </Badge>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-3">
            {drafts.length === 0 ? (
              <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
                <EmptyDescription>
                  No drafts yet. Generate drafts from selected inbox notes to review them here.
                </EmptyDescription>
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
                        <Badge variant="secondary">{draft.status}</Badge>
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
          <DraftEditor key={selectedDraft.id} draft={selectedDraft} onSaved={fetchDrafts} />
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
  onSaved
}: {
  draft: IssueDraft
  onSaved: () => Promise<void>
}): React.JSX.Element {
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [labels, setLabels] = useState(formatLabels(draft.labels))
  const [criteria, setCriteria] = useState(extractAcceptanceCriteria(draft.body).join('\n'))
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(draft.githubIssueUrl)

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
    if (publishing || saving || isPublished) return

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
  }, [draft.id, editedDraft, isPublished, onSaved, publishing, saving])

  const handleSaveShortcut = useEffectEvent(() => {
    if (dirty && !saving) void handleSave()
  })

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
              disabled={publishing || saving || isPublished}
              onClick={() => void handlePublish()}
            >
              <HugeiconsIcon icon={ViewIcon} data-icon="inline-start" aria-hidden />
              {publishing ? 'Publishing' : isPublished ? 'Published' : 'Publish'}
            </Button>
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
              <Badge variant="secondary">{draft.status}</Badge>
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
            {draft.sourceNoteIds.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {draft.sourceNoteIds.map((id) => (
                  <li key={id} className="truncate font-mono text-xs text-muted-foreground">
                    {id}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No source notes recorded.</p>
            )}
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Affected Files</h3>
            {draft.affectedFiles.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {draft.affectedFiles.map((file) => (
                  <li key={`${file.path}:${file.reason}`} className="min-w-0">
                    <p className="truncate font-mono text-xs">{file.path}</p>
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {file.reason}
                    </p>
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
