import {
  ArrowRight01Icon,
  CancelCircleIcon,
  Loading03Icon,
  Tick02Icon,
  UnfoldMoreIcon,
  ViewIcon,
  ViewOffSlashIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Empty, EmptyDescription } from '@renderer/components/ui/empty'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import { Separator } from '@renderer/components/ui/separator'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { cn } from '@renderer/lib/utils'
import type {
  AgentRunDetail,
  AgentRunListItem,
  AgentRunStatus,
  AgentRunStatusCounts
} from '@shared/ipc'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

const EMPTY_RUN_STATUS_COUNTS: AgentRunStatusCounts = {
  running: 0,
  succeeded: 0,
  failed: 0,
  cancelled: 0
}

// Order matches lifecycle: active → outcomes (success / failure → terminal cancelled).

const STATUS_FILTERS: { value: AgentRunStatus; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' }
]

const RUN_STATUS_ROW_LABEL = STATUS_FILTERS.reduce(
  (acc, row) => ({ ...acc, [row.value]: row.label }),
  {} as Record<AgentRunStatus, string>
)

const ROW_HEIGHT = 92
const OVERSCAN = 6
const RUN_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit'
})

function formatTimestamp(iso: string): string {
  return RUN_TIMESTAMP_FORMATTER.format(new Date(iso))
}

function formatDuration(run: AgentRunListItem): string {
  const duration = run.durationMs ?? Date.now() - Date.parse(run.startedAt)
  if (!Number.isFinite(duration) || duration < 0) return '...'
  if (duration < 1000) return `${duration} ms`

  const precision = duration < 10000 ? 1 : 0
  return `${(duration / 1000).toFixed(precision)} s`
}

function statusIcon(status: AgentRunStatus): React.JSX.Element {
  switch (status) {
    case 'running':
      return <HugeiconsIcon icon={Loading03Icon} aria-hidden className="animate-spin" />
    case 'succeeded':
      return <HugeiconsIcon icon={Tick02Icon} aria-hidden />
    case 'cancelled':
      return <HugeiconsIcon icon={CancelCircleIcon} aria-hidden />
    case 'failed':
      return <HugeiconsIcon icon={UnfoldMoreIcon} aria-hidden />
  }
}

function statusTone(status: AgentRunStatus): string {
  switch (status) {
    case 'failed':
      return 'border-destructive/25 bg-destructive/10 text-destructive'
    case 'cancelled':
      return 'border-border bg-muted text-muted-foreground'
    case 'succeeded':
      return 'border-border bg-muted text-foreground'
    case 'running':
      return 'border-primary/30 bg-primary/10 text-foreground'
  }
}

function runRowClassName(selected: boolean): string {
  return cn(
    'mb-1 flex h-[92px] w-full min-w-0 flex-col overflow-hidden rounded-md border px-3 py-2.5 text-left transition-colors',
    selected ? 'border-border bg-muted' : 'border-transparent hover:bg-muted/60'
  )
}

function outputDraftClassName(selected: boolean): string {
  return cn(
    'flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
    selected ? 'bg-muted' : 'bg-background'
  )
}

export function AgentRuns({
  onOpenSourceNote,
  focusRunId
}: {
  onOpenSourceNote: (noteId: string) => void
  focusRunId?: string | null
}): React.JSX.Element {
  const [runs, setRuns] = useState<AgentRunListItem[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AgentRunDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState<AgentRunStatus | undefined>()
  const [statusCounts, setStatusCounts] = useState<AgentRunStatusCounts>(() => ({
    ...EMPTY_RUN_STATUS_COUNTS
  }))
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(1)
  const [loadingRuns, setLoadingRuns] = useState(true)
  const [runsError, setRunsError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const detailFetchId = useRef(0)

  const fetchRuns = useCallback(async (): Promise<void> => {
    setLoadingRuns(true)
    setRunsError(null)
    try {
      const [result, counts] = await Promise.all([
        window.pilog.invoke('agent-runs:list', {
          status: statusFilter,
          limit: 200
        }),
        window.pilog.invoke('agent-runs:counts')
      ])
      setRuns(result)
      setStatusCounts(counts)
      setSelectedRunId((current) => {
        if (focusRunId && result.some((r) => r.id === focusRunId)) return focusRunId
        if (current && result.some((r) => r.id === current)) return current
        return result[0]?.id ?? null
      })
    } catch (err) {
      setRuns([])
      setRunsError(err instanceof Error ? err.message : 'Run history could not be read.')
      setSelectedRunId(null)
    } finally {
      setLoadingRuns(false)
    }
  }, [statusFilter, focusRunId])

  const fetchDetail = useCallback(async (runId: string): Promise<void> => {
    const id = ++detailFetchId.current
    await window.pilog.invoke('agent-runs:get', { id: runId }).then((result) => {
      if (id !== detailFetchId.current) return
      setDetail(result)
      setSelectedDraftId(result?.outputDrafts[0]?.id ?? null)
    })
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchRuns()
    })
  }, [fetchRuns])

  const handleRunsInvalidated = useEffectEvent(() => {
    void fetchRuns()
    if (selectedRunId) void fetchDetail(selectedRunId)
  })

  useEffect(() => window.pilog.on('agent-runs:invalidated', handleRunsInvalidated), [])

  useEffect(() => {
    if (!selectedRunId) {
      queueMicrotask(() => setDetail(null))
      return
    }
    void fetchDetail(selectedRunId)
  }, [fetchDetail, selectedRunId])

  useEffect(() => {
    const element = listRef.current
    if (!element) return
    const measure = (): void => setViewportHeight(element.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const virtual = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const count = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
    const end = Math.min(runs.length, start + count)
    return {
      before: start * ROW_HEIGHT,
      after: Math.max(0, (runs.length - end) * ROW_HEIGHT),
      items: runs.slice(start, end)
    }
  }, [runs, scrollTop, viewportHeight])

  const selectedDraft = detail?.outputDrafts.find((draft) => draft.id === selectedDraftId) ?? null

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-80 min-w-0 shrink-0 flex-col overflow-hidden border-r">
        <div
          className="grid shrink-0 grid-cols-2 gap-x-1 gap-y-0.5 border-b px-2.5 py-2"
          role="group"
          aria-label="Filter runs by status"
        >
          {STATUS_FILTERS.map((row) => {
            const active = statusFilter === row.value
            const count = statusCounts[row.value]
            return (
              <button
                key={row.value}
                type="button"
                data-testid={`run-filter-${row.value}`}
                aria-pressed={active}
                onClick={() => {
                  setStatusFilter((prev) => (prev === row.value ? undefined : row.value))
                  setSelectedRunId(null)
                }}
                className={cn(
                  'group/status-row flex h-7 min-w-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5',
                  'text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-1.5 shrink-0 rounded-full transition-colors',
                    active ? 'bg-primary' : 'border border-muted-foreground/40'
                  )}
                />
                <span className="flex-1 truncate text-left">{row.label}</span>
                <span
                  aria-hidden
                  className={cn(
                    'tabular shrink-0 text-[10px]',
                    active ? 'text-foreground/70' : 'text-muted-foreground/60'
                  )}
                >
                  {count}
                </span>
                <span className="sr-only">
                  {count} {count === 1 ? 'run' : 'runs'}
                </span>
              </button>
            )
          })}
        </div>

        <div
          ref={listRef}
          data-testid="agent-runs-list"
          className="flex-1 overflow-y-auto p-3"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          {loadingRuns ? (
            <div className="flex flex-col gap-1" aria-label="Loading agent runs">
              <Skeleton className="h-[92px] rounded-md" />
              <Skeleton className="h-[92px] rounded-md" />
              <Skeleton className="h-[92px] rounded-md" />
            </div>
          ) : runsError ? (
            <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
              <EmptyDescription>
                Run history could not be read. Failed generation details stay local, so try loading
                them again.
              </EmptyDescription>
              <Button type="button" variant="outline" size="sm" onClick={() => void fetchRuns()}>
                Try again
              </Button>
              <p className="line-clamp-3 font-mono text-xs text-muted-foreground">{runsError}</p>
            </Empty>
          ) : runs.length === 0 ? (
            <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
              <EmptyDescription>No agent runs match this filter.</EmptyDescription>
            </Empty>
          ) : (
            <div style={{ height: runs.length * ROW_HEIGHT }}>
              <div style={{ transform: `translateY(${virtual.before}px)` }}>
                {virtual.items.map((run) => {
                  const selected = selectedRunId === run.id
                  return (
                    <button
                      key={run.id}
                      type="button"
                      data-testid="agent-run-row"
                      onClick={() => setSelectedRunId(run.id)}
                      className={runRowClassName(selected)}
                    >
                      <span className="truncate text-sm leading-snug text-foreground">
                        {formatDuration(run)} · {run.inputNoteCount} notes · {run.outputDraftCount}{' '}
                        drafts
                      </span>
                      <span className="mt-1 flex min-w-0 items-center justify-between gap-2 text-xs">
                        <Badge
                          variant="outline"
                          className={`shrink-0 gap-1.5 font-normal ${statusTone(run.status)}`}
                        >
                          {statusIcon(run.status)}
                          {RUN_STATUS_ROW_LABEL[run.status]}
                        </Badge>
                        <span className="tabular shrink-0 whitespace-nowrap text-muted-foreground">
                          {formatTimestamp(run.startedAt)}
                        </span>
                      </span>
                      {run.status === 'failed' && run.errorMessage && (
                        <span className="mt-1 truncate text-xs text-destructive">
                          {run.errorMessage}
                        </span>
                      )}
                    </button>
                  )
                })}
                {virtual.after > 0 && <div style={{ height: virtual.after }} />}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <ScrollArea className="h-full">
          {detail ? (
            <RunDetail
              run={detail}
              selectedDraftId={selectedDraftId}
              selectedDraft={selectedDraft}
              onSelectDraft={setSelectedDraftId}
              onOpenSourceNote={onOpenSourceNote}
            />
          ) : (
            <Empty className="h-full border-none bg-transparent shadow-none">
              <EmptyDescription>
                Select a run to inspect its notes, drafts, and transcript.
              </EmptyDescription>
            </Empty>
          )}
        </ScrollArea>
      </main>
    </div>
  )
}

function RunDetail({
  run,
  selectedDraftId,
  selectedDraft,
  onSelectDraft,
  onOpenSourceNote
}: {
  run: AgentRunDetail
  selectedDraftId: string | null
  selectedDraft: AgentRunDetail['outputDrafts'][number] | null
  onSelectDraft: (id: string) => void
  onOpenSourceNote: (noteId: string) => void
}): React.JSX.Element {
  const [activeTab, setActiveTab] = useState('drafts')

  const summaryParts: string[] = []
  summaryParts.push(formatDuration(run))
  summaryParts.push(`${run.inputNoteCount} note${run.inputNoteCount === 1 ? '' : 's'}`)
  summaryParts.push(`→ ${run.outputDraftCount} draft${run.outputDraftCount === 1 ? '' : 's'}`)
  if (run.finishedAt) {
    summaryParts.push(`Finished ${formatTimestamp(run.finishedAt)}`)
  } else {
    summaryParts.push('In progress')
  }

  return (
    <article className="flex min-h-full flex-col">
      {/* Header */}
      <header className="shrink-0 border-b px-8 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="tabular font-mono text-xs text-muted-foreground">{run.id}</p>
            <h2 className="mt-1 font-heading text-2xl font-medium tracking-tight">
              {formatTimestamp(run.startedAt)}
            </h2>
          </div>
          <Badge variant="outline" className={`shrink-0 gap-1.5 ${statusTone(run.status)}`}>
            {statusIcon(run.status)}
            {run.status}
          </Badge>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">{summaryParts.join(' · ')}</p>

        {run.status === 'failed' && (
          <div className="mt-3 rounded-md border bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">{run.errorMessage ?? 'The agent run failed.'}</p>
          </div>
        )}
        {run.status === 'cancelled' && (
          <div className="mt-3 rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            This run was cancelled before it finished.
          </div>
        )}
      </header>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col">
        <div className="shrink-0 border-b px-8 pt-4">
          <TabsList variant="line">
            <TabsTrigger value="drafts">
              Drafts
              {run.outputDrafts.length > 0 && (
                <span className="tabular ml-1.5 text-xs text-muted-foreground">
                  {run.outputDrafts.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="transcript">
              Transcript
              {run.eventStream.length > 0 && (
                <span className="tabular ml-1.5 text-xs text-muted-foreground">
                  {run.eventStream.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="drafts" className="flex-1 overflow-hidden">
          <div className="grid h-full xl:grid-cols-[minmax(18rem,0.75fr)_minmax(24rem,1fr)]">
            {/* Left: Source notes + Draft list */}
            <ScrollArea className="h-full">
              <div className="space-y-6 p-8">
                {/* Source Notes */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Source Notes</h3>
                  {run.sourceNotes.length > 0 ? (
                    <div className="space-y-2">
                      {run.sourceNotes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          data-testid="run-source-note"
                          onClick={() => onOpenSourceNote(note.id)}
                          className="w-full rounded-md border bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                        >
                          <p className="line-clamp-3 text-sm leading-relaxed">
                            {note.content.trim() || 'Untitled note'}
                          </p>
                          <p className="mt-1 tabular font-mono text-xs text-muted-foreground">
                            {formatTimestamp(note.createdAt)}
                          </p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No source notes were recorded.</p>
                  )}
                </section>

                <Separator />

                {/* Output Drafts */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold">Output Drafts</h3>
                  {run.outputDrafts.length > 0 ? (
                    <div className="space-y-2">
                      {run.outputDrafts.map((draft) => (
                        <button
                          key={draft.id}
                          type="button"
                          data-testid="run-output-draft"
                          onClick={() => onSelectDraft(draft.id)}
                          className={outputDraftClassName(selectedDraftId === draft.id)}
                        >
                          <span className="min-w-0 text-left">
                            <span className="block truncate text-sm font-medium">
                              {draft.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {draft.confidence} confidence
                            </span>
                          </span>
                          <HugeiconsIcon
                            icon={ArrowRight01Icon}
                            aria-hidden
                            className="mt-0.5 shrink-0"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No drafts were produced.</p>
                  )}
                </section>
              </div>
              <ScrollBar />
            </ScrollArea>

            {/* Right: Draft detail */}
            <ScrollArea className="h-full border-l bg-muted/20">
              <div className="p-8">
                {selectedDraft ? (
                  <div
                    data-testid="run-draft-detail"
                    className="prose prose-sm max-w-none text-foreground"
                  >
                    <h3 className="font-sans text-base font-semibold">{selectedDraft.title}</h3>
                    <p className="text-sm text-muted-foreground">{selectedDraft.groupingReason}</p>
                    <pre className="mt-3 whitespace-pre-wrap rounded-md border bg-background p-3 font-mono text-xs leading-relaxed">
                      {selectedDraft.body}
                    </pre>
                  </div>
                ) : (
                  <Empty className="border-none bg-transparent shadow-none">
                    <EmptyDescription>Select a draft to read it.</EmptyDescription>
                  </Empty>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="transcript" className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-8">
              {run.eventStream.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    {run.eventStream.length} event{run.eventStream.length === 1 ? '' : 's'}: debug
                    data for this run.
                  </p>
                  <ol data-testid="run-event-transcript" className="space-y-2">
                    {run.eventStream.map((event, index) => {
                      const eventType =
                        event && typeof event === 'object' && 'type' in event
                          ? String((event as { type: unknown }).type)
                          : `event ${index + 1}`
                      return (
                        <EventItem key={index} index={index} eventType={eventType} event={event} />
                      )
                    })}
                  </ol>
                </div>
              ) : (
                <Empty className="border-none bg-transparent shadow-none">
                  <EmptyDescription>No events were persisted for this run.</EmptyDescription>
                </Empty>
              )}
            </div>
            <ScrollBar />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </article>
  )
}

function EventItem({
  index,
  eventType,
  event
}: {
  index: number
  eventType: string
  event: unknown
}): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <li className="rounded-md border bg-background">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <span className="font-mono text-xs font-medium text-muted-foreground">
              <span className="tabular mr-2 text-muted-foreground/60">{index + 1}.</span>
              {eventType}
            </span>
            <HugeiconsIcon
              icon={open ? ViewOffSlashIcon : ViewIcon}
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-3 py-2.5">
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
              {JSON.stringify(event, null, 2)}
            </pre>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}
