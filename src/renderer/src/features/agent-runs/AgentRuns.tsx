import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  CancelCircleIcon,
  Loading03Icon,
  Tick02Icon,
  UnfoldMoreIcon
} from '@hugeicons/core-free-icons'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Empty, EmptyDescription } from '@renderer/components/ui/empty'
import type { AgentRunDetail, AgentRunListItem, AgentRunStatus } from '@shared/ipc'

const STATUS_FILTERS: { value: AgentRunStatus; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' }
]

const ROW_HEIGHT = 88
const OVERSCAN = 6

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(iso))
}

function formatDuration(run: AgentRunListItem): string {
  const duration = run.durationMs ?? Date.now() - Date.parse(run.startedAt)
  if (!Number.isFinite(duration) || duration < 0) return '...'
  if (duration < 1000) return `${duration} ms`
  return `${(duration / 1000).toFixed(duration < 10000 ? 1 : 0)} s`
}

function statusIcon(status: AgentRunStatus): React.JSX.Element {
  if (status === 'running')
    return <HugeiconsIcon icon={Loading03Icon} aria-hidden className="animate-spin" />
  if (status === 'succeeded') return <HugeiconsIcon icon={Tick02Icon} aria-hidden />
  if (status === 'cancelled') return <HugeiconsIcon icon={CancelCircleIcon} aria-hidden />
  return <HugeiconsIcon icon={UnfoldMoreIcon} aria-hidden />
}

function statusTone(status: AgentRunStatus): string {
  if (status === 'failed') return 'border-destructive/25 bg-destructive/10 text-destructive'
  if (status === 'cancelled') return 'border-border bg-muted text-muted-foreground'
  if (status === 'succeeded') return 'border-border bg-muted text-foreground'
  return 'border-primary/30 bg-primary/10 text-foreground'
}

export function AgentRuns({
  onBack,
  onOpenSourceNote
}: {
  onBack: () => void
  onOpenSourceNote: (noteId: string) => void
}): React.JSX.Element {
  const [runs, setRuns] = useState<AgentRunListItem[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AgentRunDetail | null>(null)
  const [statusFilter, setStatusFilter] = useState<AgentRunStatus | undefined>()
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(1)
  const listRef = useRef<HTMLDivElement | null>(null)
  const detailFetchId = useRef(0)

  const fetchRuns = useCallback(async (): Promise<void> => {
    const result = await window.pilog.invoke('agent-runs:list', {
      status: statusFilter,
      limit: 200
    })
    setRuns(result)
    setSelectedRunId((current) => current ?? result[0]?.id ?? null)
  }, [statusFilter])

  const fetchDetail = useCallback(async (runId: string): Promise<void> => {
    const id = ++detailFetchId.current
    const result = await window.pilog.invoke('agent-runs:get', { id: runId })
    if (id !== detailFetchId.current) return
    setDetail(result)
    setSelectedDraftId(result?.outputDrafts[0]?.id ?? null)
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchRuns()
    })
  }, [fetchRuns])

  useEffect(() => {
    return window.pilog.on('agent-runs:invalidated', () => {
      void fetchRuns()
      if (selectedRunId) void fetchDetail(selectedRunId)
    })
  }, [fetchDetail, fetchRuns, selectedRunId])

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
    <div className="flex h-screen bg-background text-foreground">
      <aside className="flex w-[27rem] min-w-0 shrink-0 flex-col overflow-hidden border-r">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-medium tracking-tight">Agent Runs</h1>
            <p className="tabular text-xs text-muted-foreground">{runs.length} visible</p>
          </div>
          <Button variant="outline" size="sm" onClick={onBack}>
            Inbox
          </Button>
        </header>

        <div className="flex shrink-0 flex-wrap gap-x-1.5 gap-y-1 border-b px-6 py-2.5">
          {STATUS_FILTERS.map((chip) => {
            const active = statusFilter === chip.value
            return (
              <Button
                key={chip.value}
                type="button"
                variant={active ? 'secondary' : 'ghost'}
                size="xs"
                data-testid={`run-filter-${chip.value}`}
                onClick={() => {
                  setStatusFilter((prev) => (prev === chip.value ? undefined : chip.value))
                  setSelectedRunId(null)
                }}
                aria-pressed={active}
                className="rounded-full gap-1.5 font-medium"
              >
                <span
                  aria-hidden
                  className={
                    'h-1.5 w-1.5 rounded-full ' + (active ? 'bg-primary' : 'bg-transparent')
                  }
                />
                {chip.label}
              </Button>
            )
          })}
        </div>

        <div
          ref={listRef}
          data-testid="agent-runs-list"
          className="flex-1 overflow-y-auto p-3"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          {runs.length === 0 ? (
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
                      className={
                        'mb-1 flex h-[84px] w-full min-w-0 flex-col rounded-md border px-3 py-2.5 text-left transition-colors ' +
                        (selected
                          ? 'border-border bg-muted'
                          : 'border-transparent hover:bg-muted/60')
                      }
                    >
                      <span className="flex min-w-0 items-center justify-between gap-3">
                        <span className="tabular truncate font-mono text-xs text-muted-foreground">
                          {formatTimestamp(run.startedAt)}
                        </span>
                        <Badge variant="outline" className={`gap-1.5 ${statusTone(run.status)}`}>
                          {statusIcon(run.status)}
                          {run.status}
                        </Badge>
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="tabular">{formatDuration(run)}</span>
                        <span className="tabular">{run.inputNoteCount} notes</span>
                        <span className="tabular">{run.outputDraftCount} drafts</span>
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

      <main className="min-w-0 flex-1 overflow-y-auto">
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
  return (
    <article className="mx-auto flex min-h-full max-w-6xl flex-col px-8 py-6">
      <header className="border-b pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="tabular font-mono text-xs text-muted-foreground">{run.id}</p>
            <h2 className="mt-1 font-heading text-2xl font-medium tracking-tight">
              {formatTimestamp(run.startedAt)}
            </h2>
          </div>
          <Badge variant="outline" className={`gap-1.5 ${statusTone(run.status)}`}>
            {statusIcon(run.status)}
            {run.status}
          </Badge>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Metric label="Duration" value={formatDuration(run)} />
          <Metric label="Source notes" value={String(run.inputNoteCount)} />
          <Metric label="Output drafts" value={String(run.outputDraftCount)} />
          <Metric
            label="Finished"
            value={run.finishedAt ? formatTimestamp(run.finishedAt) : 'In progress'}
          />
        </dl>
        {run.status === 'failed' && (
          <div className="mt-4 rounded-md border bg-destructive/10 p-3 text-sm text-destructive">
            <p className="font-medium">{run.errorMessage ?? 'The agent run failed.'}</p>
            <p className="mt-1 text-destructive/80">
              Retry will be available in a later prompt-iteration slice.
            </p>
          </div>
        )}
        {run.status === 'cancelled' && (
          <div className="mt-4 rounded-md border bg-muted p-3 text-sm text-muted-foreground">
            This run was cancelled before it finished.
          </div>
        )}
      </header>

      <section className="grid gap-6 py-6 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(24rem,1fr)]">
        <div className="space-y-6">
          <Panel title="Source Notes">
            <div className="space-y-2">
              {run.sourceNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  data-testid="run-source-note"
                  onClick={() => onOpenSourceNote(note.id)}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <p className="line-clamp-3 text-sm leading-relaxed">
                    {note.content.trim() || 'Untitled note'}
                  </p>
                  <p className="mt-1 tabular font-mono text-xs text-muted-foreground">
                    {formatTimestamp(note.createdAt)}
                  </p>
                </button>
              ))}
              {run.sourceNotes.length === 0 && (
                <p className="text-sm text-muted-foreground">No source notes were recorded.</p>
              )}
            </div>
          </Panel>

          <Panel title="Output Drafts">
            <div className="space-y-2">
              {run.outputDrafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  data-testid="run-output-draft"
                  onClick={() => onSelectDraft(draft.id)}
                  className={
                    'flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 ' +
                    (selectedDraftId === draft.id ? 'bg-muted' : 'bg-background')
                  }
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{draft.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {draft.confidence} confidence
                    </span>
                  </span>
                  <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden className="mt-0.5 shrink-0" />
                </button>
              ))}
              {run.outputDrafts.length === 0 && (
                <p className="text-sm text-muted-foreground">No drafts were produced.</p>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Draft Detail">
            {selectedDraft ? (
              <div
                data-testid="run-draft-detail"
                className="prose prose-sm max-w-none text-foreground"
              >
                <h3 className="font-sans text-base font-semibold">{selectedDraft.title}</h3>
                <p className="text-sm text-muted-foreground">{selectedDraft.groupingReason}</p>
                <pre className="mt-3 whitespace-pre-wrap rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed">
                  {selectedDraft.body}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a draft to read it.</p>
            )}
          </Panel>

          <Panel title="Pi Event Transcript">
            <ol data-testid="run-event-transcript" className="space-y-2">
              {run.eventStream.map((event, index) => {
                const eventType =
                  event && typeof event === 'object' && 'type' in event
                    ? String((event as { type: unknown }).type)
                    : `event ${index + 1}`
                return (
                  <li key={index} className="rounded-md border bg-background p-3">
                    <p className="font-mono text-xs font-medium text-muted-foreground">
                      {index + 1}. {eventType}
                    </p>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {JSON.stringify(event, null, 2)}
                    </pre>
                  </li>
                )
              })}
              {run.eventStream.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No events were persisted for this run.
                </li>
              )}
            </ol>
          </Panel>
        </div>
      </section>
    </article>
  )
}

function Panel({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular mt-1 text-sm font-medium">{value}</dd>
    </div>
  )
}
