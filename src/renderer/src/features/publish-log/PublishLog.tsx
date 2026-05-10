import { ArrowDown01Icon, File01Icon, GithubIcon, ViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Separator } from '@renderer/components/ui/separator'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'
import type { PublishAuditLogEntry } from '@shared/ipc'
import { useCallback, useEffect, useState } from 'react'
import { getPublishAuditEntryViewModel, isSafeBrowserUrl } from './publish-log-view'

const PUBLISHED_AT_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

type PublishLogState =
  | { status: 'loading' }
  | { status: 'ready'; entries: PublishAuditLogEntry[] }
  | { status: 'error'; message: string }

async function readPublishLog(): Promise<PublishLogState> {
  try {
    const entries = await window.pilog.invoke('publish-log:list')
    return { status: 'ready', entries }
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Publish log could not be read.'
    }
  }
}

export function PublishLog({
  onOpenDraft,
  onOpenSourceNote
}: {
  onOpenDraft: (draftId: string) => void
  onOpenSourceNote: (noteId: string) => void
}): React.JSX.Element {
  const [state, setState] = useState<PublishLogState>({ status: 'loading' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    setState(await readPublishLog())
  }, [])

  useEffect(() => {
    let cancelled = false

    void readPublishLog().then((nextState) => {
      if (!cancelled) setState(nextState)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <ScrollArea className="h-full">
        <main className="mx-auto flex max-w-3xl flex-col px-6 py-8">
          {/* Header */}
          <header className="mb-8">
            <h1 className="font-heading text-2xl font-medium tracking-normal">Local publish log</h1>
            <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">
              Successful GitHub publishes recorded on this machine, including review-mode and
              auto-publish runs.
            </p>
          </header>

          {state.status === 'loading' ? (
            <div className="flex flex-col gap-1" aria-label="Loading publish log">
              <Skeleton className="h-24 rounded-md" />
              <Skeleton className="h-24 rounded-md" />
            </div>
          ) : state.status === 'error' ? (
            <Empty className="min-h-[360px] border border-border">
              <EmptyHeader>
                <EmptyTitle>Publish log unavailable</EmptyTitle>
                <EmptyDescription>
                  The local publish log could not be read. It only records successful GitHub
                  publishes from this machine.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <p className="font-mono text-xs text-muted-foreground">{state.message}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
                  Retry
                </Button>
              </EmptyContent>
            </Empty>
          ) : state.entries.length === 0 ? (
            <Empty className="min-h-[360px] border border-border">
              <EmptyHeader>
                <EmptyTitle>No successful publishes recorded</EmptyTitle>
                <EmptyDescription>
                  This local log starts filling after Pilog successfully creates GitHub issues. Dry
                  runs and failed publishes are not written here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ol className="flex flex-col" aria-label="Published GitHub issues">
              {state.entries.map((entry, index) => (
                <li key={entry.id}>
                  <PublishLogRow
                    entry={entry}
                    onOpenDraft={onOpenDraft}
                    onOpenSourceNote={onOpenSourceNote}
                  />
                  {index < state.entries.length - 1 && <Separator className="bg-border/60" />}
                </li>
              ))}
            </ol>
          )}
        </main>
      </ScrollArea>
    </div>
  )
}

function PublishLogRow({
  entry,
  onOpenDraft,
  onOpenSourceNote
}: {
  entry: PublishAuditLogEntry
  onOpenDraft: (draftId: string) => void
  onOpenSourceNote: (noteId: string) => void
}): React.JSX.Element {
  const view = getPublishAuditEntryViewModel(entry)
  const draftId = entry.draftId
  const githubLinkSafe = isSafeBrowserUrl(entry.githubIssueUrl)
  const hasSourceNotes = entry.sourceNotes.length > 0

  return (
    <article
      className={cn(
        'group flex flex-col gap-2 rounded-md px-3 py-3 transition-colors',
        'hover:bg-muted/40'
      )}
    >
      {/* Top row: title + actions */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
              </TooltipTrigger>
              <TooltipContent>Published successfully</TooltipContent>
            </Tooltip>
            <h2 className="font-heading text-base font-medium leading-snug text-foreground">
              {view.title}
            </h2>
            <Badge variant="secondary" className="shrink-0 text-[11px] font-normal">
              {view.repoLabel}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Published{' '}
            <time dateTime={entry.publishedAt} className="tabular">
              {PUBLISHED_AT_FORMATTER.format(new Date(entry.publishedAt))}
            </time>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {draftId !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenDraft(draftId)}
              className="h-7 text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={ViewIcon} data-icon="inline-start" aria-hidden />
              Draft
            </Button>
          )}
          {githubLinkSafe ? (
            <Button asChild size="sm" className="h-7">
              <a href={entry.githubIssueUrl} target="_blank" rel="noreferrer">
                <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" aria-hidden />
                GitHub
              </a>
            </Button>
          ) : (
            <span className="font-mono text-xs text-muted-foreground">{entry.githubIssueUrl}</span>
          )}
        </div>
      </div>

      {/* Source summary */}
      <p className="max-w-[68ch] text-sm leading-snug text-muted-foreground">
        {view.sourceSummary}
      </p>

      {/* Source notes: collapsible, compact */}
      {hasSourceNotes && (
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="group/trigger flex w-full cursor-pointer items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
            <span className="text-xs text-muted-foreground">
              {entry.sourceNotes.length} source {entry.sourceNotes.length === 1 ? 'note' : 'notes'}
            </span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/trigger:rotate-180"
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
            <ul className="mt-2 flex flex-col">
              {entry.sourceNotes.map((note, noteIndex) => (
                <li
                  key={note.id}
                  className={cn(
                    'flex flex-col gap-1.5 py-2',
                    'sm:flex-row sm:items-start sm:justify-between',
                    noteIndex > 0 && 'border-t border-border/40'
                  )}
                >
                  <p className="min-w-0 max-w-[68ch] flex-1 text-sm leading-snug text-foreground">
                    {note.content}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 self-start text-muted-foreground hover:text-foreground"
                    onClick={() => onOpenSourceNote(note.id)}
                  >
                    <HugeiconsIcon icon={File01Icon} data-icon="inline-start" aria-hidden />
                    Source
                  </Button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </article>
  )
}
