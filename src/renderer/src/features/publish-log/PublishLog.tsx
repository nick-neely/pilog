import { File01Icon, GithubIcon, ViewIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Skeleton } from '@renderer/components/ui/skeleton'
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
    try {
      const entries = await window.pilog.invoke('publish-log:list')
      setState({ status: 'ready', entries })
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Publish log could not be read.'
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <ScrollArea className="h-full">
        <main className="mx-auto flex max-w-4xl flex-col gap-5 px-6 py-6">
          <header className="flex flex-col gap-2">
            <div>
              <h1 className="font-heading text-2xl font-medium tracking-normal">
                Local publish log
              </h1>
              <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
                Successful GitHub publishes recorded on this machine, including review-mode and
                auto-publish runs.
              </p>
            </div>
          </header>

          {state.status === 'loading' ? (
            <div className="flex flex-col gap-3" aria-label="Loading publish log">
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
                  This local log starts filling after PiLog successfully creates GitHub issues. Dry
                  runs and failed publishes are not written here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ol className="flex flex-col gap-3" aria-label="Published GitHub issues">
              {state.entries.map((entry) => (
                <PublishLogRow
                  key={entry.id}
                  entry={entry}
                  onOpenDraft={onOpenDraft}
                  onOpenSourceNote={onOpenSourceNote}
                />
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
  const githubLinkSafe = isSafeBrowserUrl(entry.githubIssueUrl)

  return (
    <li className="rounded-md border bg-card px-4 py-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">{view.title}</h2>
              <Badge variant="secondary">{view.repoLabel}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Published{' '}
              <time dateTime={entry.publishedAt} className="tabular">
                {PUBLISHED_AT_FORMATTER.format(new Date(entry.publishedAt))}
              </time>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {entry.draftId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenDraft(entry.draftId as string)}
              >
                <HugeiconsIcon icon={ViewIcon} data-icon="inline-start" aria-hidden />
                Open draft
              </Button>
            ) : null}
            {githubLinkSafe ? (
              <Button asChild variant="outline" size="sm">
                <a href={entry.githubIssueUrl} target="_blank" rel="noreferrer">
                  <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" aria-hidden />
                  GitHub
                </a>
              </Button>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {entry.githubIssueUrl}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{view.sourceSummary}</p>
          {entry.sourceNotes.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {entry.sourceNotes.map((note) => (
                <li
                  key={note.id}
                  className={cn(
                    'flex flex-col gap-2 rounded-md bg-muted/45 px-3 py-2',
                    'sm:flex-row sm:items-start sm:justify-between'
                  )}
                >
                  <p className="min-w-0 max-w-[72ch] text-sm leading-relaxed">{note.content}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => onOpenSourceNote(note.id)}
                  >
                    <HugeiconsIcon icon={File01Icon} data-icon="inline-start" aria-hidden />
                    Source note
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  )
}
