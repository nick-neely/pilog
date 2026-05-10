import { Add01Icon, Cancel01Icon, GithubIcon, SparklesIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Empty, EmptyDescription } from '@renderer/components/ui/empty'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import type { RunNavigationOrigin } from '@renderer/features/agent-runs/navigation'
import { cn } from '@renderer/lib/utils'
import type {
  GenerateDraftsMode,
  ListNotesRequest,
  Note,
  OnboardingState,
  NoteStatus,
  NoteStatusCounts,
  PiStatus,
  Repo
} from '@shared/ipc'
import {
  DEFAULT_ONBOARDING_STATE,
  completeOnboardingState,
  confirmHotkeyOnboardingState,
  getCurrentOnboardingStep,
  resumeOnboardingState,
  skipOnboardingState,
  type OnboardingStepId
} from '@shared/onboarding'
import type {
  AutoPublishPreviewSummary,
  AutoPublishPublishReport,
  GeneratedIssueDraft,
  IssueDraftForReview,
  IssueDraftStatus
} from '@shared/types'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { StatusFilter } from './StatusFilter'

// Status filter rows. Order matches the inbox lifecycle (capture →
// triage → publish → archive) so the list reads top-to-bottom as a
// pipeline and the user's eye lands on Unprocessed first by default.
const STATUS_FILTER_ROWS: { value: NoteStatus; label: string }[] = [
  { value: 'unprocessed', label: 'Unprocessed' },
  { value: 'drafted', label: 'Drafted' },
  { value: 'published', label: 'Published' },
  { value: 'dismissed', label: 'Dismissed' }
]

const STATUS_LABEL: Record<NoteStatus, string> = STATUS_FILTER_ROWS.reduce(
  (acc, { value, label }) => ({ ...acc, [value]: label }),
  {} as Record<NoteStatus, string>
)

const EMPTY_STATUS_COUNTS: NoteStatusCounts = {
  unprocessed: 0,
  drafted: 0,
  published: 0,
  dismissed: 0
}

const CURRENT_YEAR = new Date().getFullYear()
const SHORT_NOTE_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})
const YEAR_NOTE_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

// Humanise the timestamp for inbox metadata: same year stays short
// ("May 7, 9:18 PM"), prior years fall back to a year-bearing form. Pairs
// with `.tabular` so digits don't shimmy as the list updates.
function formatNoteTimestamp(iso: string): string {
  const date = new Date(iso)
  const sameYear = date.getFullYear() === CURRENT_YEAR
  return (sameYear ? SHORT_NOTE_TIMESTAMP_FORMATTER : YEAR_NOTE_TIMESTAMP_FORMATTER).format(date)
}

// repoFilter encoding for Select values (non-empty strings for Radix Select items).
//   '__all__'     → undefined (All repos — no filter)
//   '$unassigned' → null      (only notes with no repo)
//   repo.id       → repo.id   (specific repo)
const FILTER_ALL_REPOS = '__all__'
const UNASSIGNED_KEY = '$unassigned'
/** Note/scratchpad: no repo assigned */
const NOTE_REPO_NONE = '__none__'

type NoteDraftLink = {
  id: string
  title: string
  status: IssueDraftStatus
  updatedAt: string
}

type AutoPublishPreviewState = {
  open: boolean
  summary: AutoPublishPreviewSummary | null
  drafts: GeneratedIssueDraft[]
  sourceNotes: Note[]
  report: AutoPublishPublishReport | null
  publishing: boolean
  publishError: string | null
}

type OnboardingPanelProps = {
  state: OnboardingState
  step: OnboardingStepId
  githubConnected: boolean
  repoCount: number
  piConfigured: boolean
  noteCount: number
  draftCount: number
  working: boolean
  onConfirmHotkey: () => void
  onConnectGitHub: () => void
  onLinkRepo: () => void
  onConfigurePi: () => void
  onCreateFirstNote: () => void
  onGenerateFirstDraft: () => void
  onOpenDrafts: () => void
  onSkip: () => void
}

function encodeRepoFilter(f: string | null | undefined): string {
  if (f === undefined) return FILTER_ALL_REPOS
  if (f === null) return UNASSIGNED_KEY
  return f
}

function decodeRepoFilter(v: string): string | null | undefined {
  if (v === FILTER_ALL_REPOS) return undefined
  if (v === UNASSIGNED_KEY) return null
  return v
}

function buildFilter(
  status: NoteStatus | undefined,
  search: string,
  repoFilter: string | null | undefined
): ListNotesRequest | undefined {
  const filter: ListNotesRequest = {}
  if (status) filter.status = status
  if (search) filter.search = search
  if (repoFilter !== undefined) filter.repoId = repoFilter
  return Object.keys(filter).length > 0 ? filter : undefined
}

function mapDraftLinksByNote(drafts: IssueDraftForReview[]): Map<string, NoteDraftLink[]> {
  const linksByNote = new Map<string, NoteDraftLink[]>()

  for (const issueDraft of drafts) {
    for (const noteId of issueDraft.sourceNoteIds) {
      const links = linksByNote.get(noteId) ?? []
      links.push({
        id: issueDraft.id,
        title: issueDraft.title,
        status: issueDraft.status,
        updatedAt: issueDraft.updatedAt
      })
      linksByNote.set(noteId, links)
    }
  }

  for (const links of linksByNote.values()) {
    links.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }

  return linksByNote
}

function getGenerateDraftsReason(input: {
  hasSelection: boolean
  selectedNotesShareRepo: boolean
  selectedNotesAllUnprocessed: boolean
  piStatus: PiStatus
  generating: boolean
}): string {
  if (input.generating) return 'Generating drafts for the selected notes.'
  if (!input.hasSelection) return 'Select one or more notes to generate drafts.'
  if (!input.selectedNotesAllUnprocessed) return 'Selected notes have already been drafted.'
  if (!input.selectedNotesShareRepo) return 'Selected notes must share one linked repository.'
  if (!input.piStatus.configured) {
    if (input.piStatus.reason === 'missing-credential')
      return 'Configure Pi credentials in Settings.'
    return 'Choose an active Pi provider and model in Settings.'
  }
  return 'Generate one issue draft from the selected notes.'
}

function getGenerateAndPublishReason(input: {
  canGenerateDrafts: boolean
  generateDraftsReason: string
  repo: Repo | null
}): string {
  if (!input.canGenerateDrafts) return input.generateDraftsReason
  if (!input.repo?.autoPublishEnabled) return 'Enable auto-publish for this repository first.'
  if (input.repo.autoPublishDryRun) return 'Generate a dry-run publish plan for selected notes.'
  return 'Generate planned drafts for review before GitHub writes.'
}

function getProcessCurrentInboxReason(input: {
  repo: Repo | null
  piStatus: PiStatus
  generating: boolean
}): string {
  if (!input.repo) return 'Filter the inbox to one linked repository first.'
  if (input.generating) return 'Planning current inbox drafts.'
  if (!input.piStatus.configured) return 'Configure Pi credentials in Settings.'

  return getGenerateAndPublishReason({
    canGenerateDrafts: true,
    generateDraftsReason: 'Ready to process current inbox.',
    repo: input.repo
  })
}

function getDetailEmptyDescription(input: {
  currentInboxMessage: string | null
  selectionCount: number
}): string {
  if (input.currentInboxMessage) return input.currentInboxMessage
  if (input.selectionCount > 1) {
    return `${input.selectionCount} notes selected. Triage actions live in the sidebar footer; press Esc to clear.`
  }
  return 'Select a note to read or edit.'
}

const ONBOARDING_STEP_LABELS: Record<OnboardingStepId, string> = {
  hotkey: 'Confirm hotkey',
  github: 'Connect GitHub',
  repo: 'Link a repo',
  pi: 'Configure Pi',
  note: 'Capture a note',
  draft: 'Generate a draft',
  review: 'Review or publish'
}

function OnboardingPanel({
  state,
  step,
  githubConnected,
  repoCount,
  piConfigured,
  noteCount,
  draftCount,
  working,
  onConfirmHotkey,
  onConnectGitHub,
  onLinkRepo,
  onConfigurePi,
  onCreateFirstNote,
  onGenerateFirstDraft,
  onOpenDrafts,
  onSkip
}: OnboardingPanelProps): React.JSX.Element {
  const completedSteps = new Set<OnboardingStepId>()
  if (state.confirmedHotkeyAt) completedSteps.add('hotkey')
  if (githubConnected) completedSteps.add('github')
  if (repoCount > 0) completedSteps.add('repo')
  if (piConfigured) completedSteps.add('pi')
  if (noteCount > 0) completedSteps.add('note')
  if (draftCount > 0) completedSteps.add('draft')

  const action = getOnboardingAction({
    step,
    working,
    onConfirmHotkey,
    onConnectGitHub,
    onLinkRepo,
    onConfigurePi,
    onCreateFirstNote,
    onGenerateFirstDraft,
    onOpenDrafts
  })

  return (
    <section
      data-testid="onboarding-panel"
      aria-labelledby="onboarding-title"
      className="mx-auto flex h-full w-full max-w-2xl flex-col justify-center px-8 py-10"
    >
      <div className="flex flex-col gap-6 border-y py-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">First run</p>
          <h2 id="onboarding-title" className="font-heading text-2xl font-normal leading-tight">
            Start with one useful draft.
          </h2>
          <p className="max-w-[62ch] text-sm leading-relaxed text-muted-foreground">
            Pilog needs a hotkey, GitHub, one local repository, Pi credentials, and one note. Each
            step uses the real app state, so you can leave and come back without losing work.
          </p>
        </div>

        <ol className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ONBOARDING_STEP_LABELS) as OnboardingStepId[]).map((id, index) => {
            const done = completedSteps.has(id)
            const current = id === step
            return (
              <li
                key={id}
                data-testid={`onboarding-step-${id}`}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm',
                  current ? 'bg-muted text-foreground' : 'text-muted-foreground',
                  done ? 'border-border' : 'border-transparent'
                )}
              >
                <span className="tabular flex size-5 shrink-0 items-center justify-center rounded-sm border font-mono text-[11px]">
                  {done ? 'OK' : index + 1}
                </span>
                <span>{ONBOARDING_STEP_LABELS[id]}</span>
              </li>
            )
          })}
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={action.onClick} disabled={working}>
            {action.label}
          </Button>
          <Button variant="ghost" onClick={onSkip} disabled={working}>
            Skip for now
          </Button>
        </div>
      </div>
    </section>
  )
}

function getOnboardingAction(input: {
  step: OnboardingStepId
  working: boolean
  onConfirmHotkey: () => void
  onConnectGitHub: () => void
  onLinkRepo: () => void
  onConfigurePi: () => void
  onCreateFirstNote: () => void
  onGenerateFirstDraft: () => void
  onOpenDrafts: () => void
}): { label: string; onClick: () => void } {
  switch (input.step) {
    case 'hotkey':
      return { label: 'Confirm CommandOrControl+Alt+N', onClick: input.onConfirmHotkey }
    case 'github':
      return {
        label: input.working ? 'Connecting' : 'Connect GitHub',
        onClick: input.onConnectGitHub
      }
    case 'repo':
      return { label: 'Link a local repo', onClick: input.onLinkRepo }
    case 'pi':
      return { label: 'Configure Pi', onClick: input.onConfigurePi }
    case 'note':
      return { label: 'Write the first note', onClick: input.onCreateFirstNote }
    case 'draft':
      return {
        label: input.working ? 'Generating' : 'Generate first draft',
        onClick: input.onGenerateFirstDraft
      }
    case 'review':
      return { label: 'Open Drafts', onClick: input.onOpenDrafts }
  }
}

function NoteDetail({
  note,
  repos,
  onSave,
  onDelete,
  onRepoChange,
  onNavigateToRepositories,
  onNavigateToAgentRuns,
  onNavigateToDraftReview,
  draftLinks
}: {
  note: Note
  repos: Repo[]
  draftLinks: NoteDraftLink[]
  onSave: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRepoChange: (id: string, repoId: string | null) => Promise<void>
  onNavigateToRepositories: () => void
  onNavigateToAgentRuns: (runId?: string, origin?: RunNavigationOrigin) => void
  onNavigateToDraftReview: (draftId?: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(note.content)
  const dirty = draft !== note.content
  const primaryDraftLink = draftLinks[0] ?? null

  const handleSave = useCallback(async (): Promise<void> => {
    await onSave(note.id, draft)
  }, [draft, note.id, onSave])
  const handleSaveShortcut = useEffectEvent(() => {
    if (dirty) void handleSave()
  })

  // Mod+S saves, matching the Scratchpad's editor convention. Keyboard-first
  // is a system promise; the visible Save button is a courtesy, not the path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const isSave = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'
      if (!isSave) return
      e.preventDefault()
      handleSaveShortcut()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <article className="flex h-full flex-col">
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="tabular font-mono text-xs text-muted-foreground">
            {formatNoteTimestamp(note.createdAt)}
          </p>
          {primaryDraftLink && (
            <button
              type="button"
              onClick={() => onNavigateToDraftReview(primaryDraftLink.id)}
              className="text-left text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {draftLinks.length > 1 ? 'View drafts' : 'View draft'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSave} disabled={!dirty} size="sm">
            Save
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                <AlertDialogDescription>
                  This cannot be undone. The note and any draft history derived from it will be
                  removed.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => onDelete(note.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>
      <div className="flex-1">
        <ScrollArea className="h-full">
          <Textarea
            aria-label="Note content"
            // Body line length capped at 72ch per DESIGN.md; mono editor body
            // pairs with the rest of the system (file paths, code blocks).
            className="mx-auto block min-h-full w-full max-w-[72ch] rounded-none border-0 bg-transparent p-6 font-mono text-sm leading-relaxed text-foreground shadow-none field-sizing-content focus-visible:ring-0"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Capture a thought…"
          />
        </ScrollArea>
      </div>
      {/* Repo and generation provenance, kept secondary to the editor body. */}
      <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-xs font-medium text-muted-foreground">Repo</span>
          {repos.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No repos linked:{' '}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-xs"
                onClick={onNavigateToRepositories}
              >
                link one in Repositories
              </Button>
            </span>
          ) : (
            <Select
              value={note.repoId ?? NOTE_REPO_NONE}
              onValueChange={(v) => void onRepoChange(note.id, v === NOTE_REPO_NONE ? null : v)}
            >
              <SelectTrigger
                aria-label="Repository"
                size="sm"
                className="max-w-[min(100%,14rem)] text-xs"
              >
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={NOTE_REPO_NONE}>Unassigned</SelectItem>
                  {repos.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.owner}/{r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </div>
        {note.runId && (
          <button
            type="button"
            onClick={() => onNavigateToAgentRuns(note.runId!, { kind: 'note', noteId: note.id })}
            className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Run
          </button>
        )}
      </footer>
    </article>
  )
}

function AutoPublishPreviewDialog({
  open,
  summary,
  drafts,
  sourceNotes,
  report,
  publishing,
  publishError,
  onOpenChange,
  onOpenDrafts,
  onPublish
}: {
  open: boolean
  summary: AutoPublishPreviewSummary | null
  drafts: GeneratedIssueDraft[]
  sourceNotes: Note[]
  report: AutoPublishPublishReport | null
  publishing: boolean
  publishError: string | null
  onOpenChange: (open: boolean) => void
  onOpenDrafts: () => void
  onPublish: () => void
}): React.JSX.Element {
  const sourceNotesById = useMemo(
    () => new Map(sourceNotes.map((note) => [note.id, note])),
    [sourceNotes]
  )
  const title = getAutoPublishDialogTitle(summary, report)
  const description = getAutoPublishDialogDescription(summary, report)

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[min(42rem,calc(100vh-4rem))] max-w-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {publishError ? (
          <div role="alert" className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
            {publishError}
          </div>
        ) : null}
        {report ? (
          <AutoPublishReport report={report} sourceNotesById={sourceNotesById} />
        ) : summary ? (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground" role="status">
            <Badge variant="secondary">
              {summary.plannedDraftCount} planned of {summary.generatedDraftCount}
            </Badge>
            <Badge variant="secondary">Limit {summary.maxIssuesPerRun}</Badge>
            <Badge variant="secondary">Label {summary.defaultLabel}</Badge>
            {summary.dryRun ? <Badge variant="secondary">Dry run, no GitHub writes</Badge> : null}
          </div>
        ) : null}
        {!report ? (
          <ScrollArea className="max-h-[24rem] pe-3">
            <div className="flex flex-col gap-4">
              {drafts.map((draft, index) => (
                <section key={`${draft.title}-${index}`} className="border-t pt-4 first:border-t-0">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="max-w-[52ch] text-base font-semibold leading-snug">
                        {draft.title}
                      </h3>
                      <Badge variant="outline">Confidence {draft.confidence}</Badge>
                    </div>
                    <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
                      {draft.summary}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {draft.suggestedLabels.map((label) => (
                        <Badge key={label} variant="secondary">
                          {label}
                        </Badge>
                      ))}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium text-muted-foreground">Source notes</p>
                        <SourceNoteList
                          noteIds={draft.sourceNoteIds}
                          sourceNotesById={sourceNotesById}
                          itemClassName="line-clamp-2 text-sm leading-relaxed"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <p className="text-xs font-medium text-muted-foreground">Affected files</p>
                        <ul className="flex flex-col gap-1">
                          {draft.affectedFiles.map((file) => (
                            <li key={file.path} className="min-w-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="truncate font-mono text-xs">{file.path}</p>
                                </TooltipTrigger>
                                <TooltipContent className="font-mono">{file.path}</TooltipContent>
                              </Tooltip>
                              <p className="line-clamp-2 text-xs text-muted-foreground">
                                {file.reason}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={publishing}>Close</AlertDialogCancel>
          {report || summary?.dryRun ? (
            <AlertDialogAction onClick={onOpenDrafts}>Open Drafts</AlertDialogAction>
          ) : (
            <AlertDialogAction disabled={publishing || !summary} onClick={onPublish}>
              {publishing ? 'Publishing' : 'Publish to GitHub'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function getAutoPublishDialogTitle(
  summary: AutoPublishPreviewSummary | null,
  report: AutoPublishPublishReport | null
): string {
  if (report) return 'Publish report'
  if (summary?.dryRun) return 'Dry-run publish plan'
  return 'Review planned GitHub issues'
}

function getAutoPublishDialogDescription(
  summary: AutoPublishPreviewSummary | null,
  report: AutoPublishPublishReport | null
): string {
  if (report) {
    return `${report.successCount} published, ${report.failureCount} failed.`
  }

  return summary?.message ?? 'Pilog planned these drafts for review before any GitHub writes.'
}

function AutoPublishReport({
  report,
  sourceNotesById
}: {
  report: AutoPublishPublishReport
  sourceNotesById: Map<string, Note>
}): React.JSX.Element {
  return (
    <ScrollArea className="max-h-[24rem] pe-3">
      <div className="flex flex-col gap-5" role="status" aria-live="polite">
        {report.successes.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Published</h3>
            <ul className="flex flex-col gap-2">
              {report.successes.map((item) => (
                <li key={item.draftId} className="rounded-md border bg-muted/30 p-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="max-w-[52ch] text-sm font-medium leading-snug">{item.title}</p>
                      <Badge variant="secondary">Published</Badge>
                    </div>
                    <a
                      href={item.githubIssueUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-mono text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
                    >
                      {item.githubIssueUrl}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {report.failures.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Needs review</h3>
            <ul className="flex flex-col gap-2">
              {report.failures.map((item) => (
                <li key={item.draftId} className="rounded-md border bg-muted/30 p-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="max-w-[52ch] text-sm font-medium leading-snug">{item.title}</p>
                      <Badge variant="outline">Kept as draft</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.error}</p>
                    <div className="flex flex-col gap-1">
                      <p className="font-mono text-xs text-muted-foreground">
                        Draft {item.draftId}
                      </p>
                      <SourceNoteList
                        noteIds={item.sourceNoteIds}
                        sourceNotesById={sourceNotesById}
                        itemClassName="line-clamp-2 text-xs leading-relaxed"
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </ScrollArea>
  )
}

function SourceNoteList({
  noteIds,
  sourceNotesById,
  itemClassName
}: {
  noteIds: string[]
  sourceNotesById: Map<string, Note>
  itemClassName: string
}): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-1">
      {noteIds.map((noteId) => {
        const note = sourceNotesById.get(noteId)
        const preview = note?.content.trim() || noteId
        return (
          <li key={noteId} className="min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn('block min-w-0', itemClassName)}>{preview}</span>
              </TooltipTrigger>
              <TooltipContent>{preview}</TooltipContent>
            </Tooltip>
          </li>
        )
      })}
    </ul>
  )
}

export function Inbox({
  focusNoteId,
  onFocusNoteHandled,
  onNavigateToAgentRuns,
  onNavigateToRepositories,
  onNavigateToSettings,
  onNavigateToDraftReview
}: {
  focusNoteId?: string | null
  onFocusNoteHandled?: () => void
  onNavigateToRepositories: () => void
  onNavigateToSettings: () => void
  onNavigateToDraftReview: (draftId?: string) => void
  onNavigateToAgentRuns: (runId?: string, origin?: RunNavigationOrigin) => void
}): React.JSX.Element {
  const [notes, setNotes] = useState<Note[]>([])
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE)
  const [onboardingNotes, setOnboardingNotes] = useState<Note[]>([])
  const [onboardingDrafts, setOnboardingDrafts] = useState<IssueDraftForReview[]>([])
  const [githubStatus, setGitHubStatus] = useState({ connected: false })
  const [onboardingWorking, setOnboardingWorking] = useState(false)
  const [draftLinksByNote, setDraftLinksByNote] = useState<Map<string, NoteDraftLink[]>>(
    () => new Map()
  )
  const [statusCounts, setStatusCounts] = useState<NoteStatusCounts>(EMPTY_STATUS_COUNTS)
  const [repos, setRepos] = useState<Repo[]>([])
  const [piStatus, setPiStatus] = useState<PiStatus>({ configured: false })
  const [generating, setGenerating] = useState(false)
  const [autoPublishPreview, setAutoPublishPreview] = useState<AutoPublishPreviewState>({
    open: false,
    summary: null,
    drafts: [],
    sourceNotes: [],
    report: null,
    publishing: false,
    publishError: null
  })
  const [statusFilter, setStatusFilter] = useState<NoteStatus | undefined>()
  const [repoFilter, setRepoFilter] = useState<string | null | undefined>(undefined)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentInboxMessage, setCurrentInboxMessage] = useState<string | null>(null)
  const lastClickedIndex = useRef<number | null>(null)
  const fetchIdRef = useRef(0)
  const countsFetchIdRef = useRef(0)
  const mountedRef = useRef(true)

  const reposById = useMemo(() => new Map(repos.map((r) => [r.id, r])), [repos])
  const onboardingStep = getCurrentOnboardingStep(onboardingState, {
    github: githubStatus,
    repos,
    pi: piStatus,
    notes: onboardingNotes,
    drafts: onboardingDrafts
  })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    window.pilog.invoke('repos:list').then(setRepos)
    window.pilog.invoke('pi:status').then(setPiStatus)
    window.pilog.invoke('github:status').then(setGitHubStatus)
    window.pilog.invoke('onboarding:get').then(setOnboardingState)
  }, [])

  const fetchNotes = useCallback(async (): Promise<void> => {
    const id = ++fetchIdRef.current
    await window.pilog
      .invoke('note:list', buildFilter(statusFilter, '', repoFilter))
      .then((result) => {
        if (id !== fetchIdRef.current) return
        setNotes(result)
        setSelectedIds((prev) => {
          const validIds = new Set(result.map((n) => n.id))
          const next = new Set([...prev].filter((rid) => validIds.has(rid)))
          return next.size === prev.size ? prev : next
        })
      })
  }, [statusFilter, repoFilter])

  // Status counts honour the repo filter but not the status filter itself;
  // they're the answer to "if I pick this status next, how many notes will I see?".
  // Keep them out-of-band from `fetchNotes` so toggling the status chip doesn't
  // refetch counts that didn't change.
  const fetchStatusCounts = useCallback(async (): Promise<void> => {
    const id = ++countsFetchIdRef.current
    await window.pilog
      .invoke('note:counts', repoFilter !== undefined ? { repoId: repoFilter } : undefined)
      .then((result) => {
        if (id !== countsFetchIdRef.current) return
        setStatusCounts(result)
      })
  }, [repoFilter])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const fetchDraftLinks = useCallback(async (): Promise<void> => {
    const drafts = await window.pilog.invoke('issue-drafts:list', { status: 'all' })
    setDraftLinksByNote(mapDraftLinksByNote(drafts))
    setOnboardingDrafts(drafts)
  }, [])

  const fetchOnboardingNotes = useCallback(async (): Promise<void> => {
    const allNotes = await window.pilog.invoke('note:list')
    setOnboardingNotes(allNotes)
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchDraftLinks()
    })
  }, [fetchDraftLinks])

  useEffect(() => {
    fetchStatusCounts()
  }, [fetchStatusCounts])

  useEffect(() => {
    fetchOnboardingNotes()
  }, [fetchOnboardingNotes])

  const handleFocusNoteHandled = useEffectEvent(() => {
    onFocusNoteHandled?.()
  })

  useEffect(() => {
    if (!focusNoteId) return
    queueMicrotask(() => {
      setStatusFilter(undefined)
      setRepoFilter(undefined)
      setSelectedIds(new Set([focusNoteId]))
      lastClickedIndex.current = null
      handleFocusNoteHandled()
    })
  }, [focusNoteId])

  const handleNoteCreated = useEffectEvent(() => {
    void fetchNotes()
    void fetchStatusCounts()
    void fetchOnboardingNotes()
  })

  useEffect(() => window.pilog.on('note:created', handleNoteCreated), [])

  const handleIssueDraftsInvalidated = useEffectEvent(() => {
    void fetchDraftLinks()
  })

  useEffect(() => window.pilog.on('issue-drafts:invalidated', handleIssueDraftsInvalidated), [])

  const handleNewNote = useCallback(async (): Promise<void> => {
    // Capture-before-triage: a new note opens empty so the editor is waiting,
    // not pre-loaded with boilerplate the user has to delete first.
    const created = await window.pilog.invoke('note:create', { content: '' })
    await Promise.all([fetchNotes(), fetchStatusCounts()])
    requestAnimationFrame(() => setSelectedIds(new Set([created.id])))
  }, [fetchNotes, fetchStatusCounts])

  const persistOnboardingState = useCallback(async (next: OnboardingState): Promise<void> => {
    const saved = await window.pilog.invoke('onboarding:set', next)
    setOnboardingState(saved)
  }, [])

  const handleConfirmHotkey = useCallback((): void => {
    void persistOnboardingState(confirmHotkeyOnboardingState(onboardingState))
  }, [onboardingState, persistOnboardingState])

  const handleSkipOnboarding = useCallback((): void => {
    void persistOnboardingState(skipOnboardingState(onboardingState))
  }, [onboardingState, persistOnboardingState])

  const handleResumeOnboarding = useCallback((): void => {
    void persistOnboardingState(resumeOnboardingState(onboardingState))
  }, [onboardingState, persistOnboardingState])

  const handleConnectGitHub = useCallback(async (): Promise<void> => {
    setOnboardingWorking(true)
    try {
      const next = await window.pilog.invoke('github:connect')
      setGitHubStatus(next)
    } finally {
      setOnboardingWorking(false)
    }
  }, [])

  const handleCreateFirstNote = useCallback(async (): Promise<void> => {
    const firstRepo = repos[0]
    const created = await window.pilog.invoke('note:create', {
      content: '',
      repoId: firstRepo?.id ?? null
    })
    await Promise.all([fetchNotes(), fetchStatusCounts(), fetchOnboardingNotes()])
    requestAnimationFrame(() => setSelectedIds(new Set([created.id])))
  }, [fetchNotes, fetchOnboardingNotes, fetchStatusCounts, repos])

  const handleSave = async (id: string, content: string): Promise<void> => {
    await window.pilog.invoke('note:update', { id, content })
    await Promise.all([fetchNotes(), fetchStatusCounts()])
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.pilog.invoke('note:delete', { id })
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    await Promise.all([fetchNotes(), fetchStatusCounts()])
  }

  const handleRepoChange = async (id: string, repoId: string | null): Promise<void> => {
    const note = notes.find((n) => n.id === id)
    if (!note) return
    await window.pilog.invoke('note:update', { id, content: note.content, repoId })
    await Promise.all([fetchNotes(), fetchStatusCounts()])
  }

  const toggleStatus = useCallback((status: NoteStatus): void => {
    setStatusFilter((prev) => (prev === status ? undefined : status))
    setSelectedIds(new Set())
    lastClickedIndex.current = null
  }, [])

  const clearSelection = useCallback((): void => {
    setSelectedIds(new Set())
    lastClickedIndex.current = null
  }, [])

  const handleNoteClick = (noteId: string, index: number, e: React.MouseEvent): void => {
    if (e.shiftKey && lastClickedIndex.current !== null) {
      const start = Math.min(lastClickedIndex.current, index)
      const end = Math.max(lastClickedIndex.current, index)
      const rangeIds = notes.slice(start, end + 1).map((n) => n.id)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of rangeIds) next.add(id)
        return next
      })
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(noteId)) {
          next.delete(noteId)
        } else {
          next.add(noteId)
        }
        return next
      })
    } else {
      setSelectedIds((prev) => {
        if (prev.size === 1 && prev.has(noteId)) return new Set()
        return new Set([noteId])
      })
    }
    lastClickedIndex.current = index
  }

  const selectedNote =
    selectedIds.size === 1 ? (notes.find((n) => selectedIds.has(n.id)) ?? null) : null

  const selectionCount = selectedIds.size
  const hasSelection = selectionCount > 0
  const selectedNotes = useMemo(
    () => notes.filter((note) => selectedIds.has(note.id)),
    [notes, selectedIds]
  )
  const selectedRepoIds = useMemo(
    () => new Set(selectedNotes.map((note) => note.repoId)),
    [selectedNotes]
  )
  const selectedNotesShareRepo =
    selectedNotes.length > 0 && selectedRepoIds.size === 1 && !selectedRepoIds.has(null)
  const selectedNotesAllUnprocessed = selectedNotes.every((note) => note.status === 'unprocessed')
  const selectedRepo =
    selectedNotesShareRepo && selectedNotes[0]?.repoId
      ? (reposById.get(selectedNotes[0].repoId) ?? null)
      : null
  const currentInboxRepo =
    typeof repoFilter === 'string' ? (reposById.get(repoFilter) ?? null) : null
  const canGenerateDrafts =
    hasSelection &&
    selectedNotesAllUnprocessed &&
    selectedNotesShareRepo &&
    piStatus.configured &&
    !generating
  const generateDraftsReason = getGenerateDraftsReason({
    hasSelection,
    selectedNotesShareRepo,
    selectedNotesAllUnprocessed,
    piStatus,
    generating
  })
  const canGenerateAndPublish = canGenerateDrafts && selectedRepo?.autoPublishEnabled === true
  const canProcessCurrentInbox =
    !hasSelection &&
    Boolean(currentInboxRepo?.autoPublishEnabled) &&
    piStatus.configured &&
    !generating
  const generateAndPublishReason = getGenerateAndPublishReason({
    canGenerateDrafts,
    generateDraftsReason,
    repo: selectedRepo
  })
  const processCurrentInboxReason = getProcessCurrentInboxReason({
    repo: currentInboxRepo,
    piStatus,
    generating
  })
  const detailEmptyDescription = getDetailEmptyDescription({
    currentInboxMessage,
    selectionCount
  })

  // Esc clears note selection. The listener uses
  // capture on `document` so key events still reach us when a control stops
  // propagation before `window`; we skip handling when the repo Select menu
  // is open so Esc can close that surface first.
  const handleInboxKeydown = useEffectEvent((e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || selectedIds.size === 0) {
      return
    }
    if (document.querySelector('[data-slot="select-content"][data-state="open"]')) {
      return
    }
    const t = e.target
    const el = t instanceof HTMLElement ? t : null
    const tag = el?.tagName?.toLowerCase()
    const typingSurface =
      tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable === true
    if (typingSurface) return
    e.preventDefault()
    clearSelection()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => handleInboxKeydown(e)
    document.addEventListener('keydown', onKey, { capture: true })
    return () => document.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  const emptyMessage = useMemo(() => {
    const filtered = Boolean(statusFilter || repoFilter !== undefined)
    return filtered
      ? 'No notes match the current filters.'
      : 'No notes yet. Capture a thought from the footer below.'
  }, [statusFilter, repoFilter])

  const handleGenerateDrafts = async (mode: GenerateDraftsMode): Promise<void> => {
    if (!canGenerateDrafts) return
    if (mode === 'auto-publish-preview' && !canGenerateAndPublish) return
    const selectedNoteSnapshot = [...selectedNotes]
    const selectedIdSnapshot = [...selectedIds]
    setGenerating(true)
    try {
      await window.pilog.runAgent({ noteIds: selectedIdSnapshot, mode }, async (event) => {
        if (event.type === 'final') {
          if (!mountedRef.current) return
          await Promise.all([fetchNotes(), fetchStatusCounts(), fetchDraftLinks()])
          if (mode === 'auto-publish-preview' && event.autoPublishPreview) {
            setAutoPublishPreview({
              open: true,
              summary: event.autoPublishPreview,
              drafts: event.drafts,
              sourceNotes: selectedNoteSnapshot,
              report: null,
              publishing: false,
              publishError: null
            })
          } else {
            if (!onboardingState.completed) {
              await persistOnboardingState(completeOnboardingState(onboardingState))
            }
            clearSelection()
            onNavigateToDraftReview()
          }
        }
        if (event.type === 'error') {
          console.error(event.message)
        }
      })
    } finally {
      if (mountedRef.current) {
        setGenerating(false)
        window.pilog.invoke('pi:status').then(setPiStatus)
      }
    }
  }

  const handleGenerateFirstDraft = async (): Promise<void> => {
    const firstReadyNote =
      onboardingNotes.find((note) => note.status === 'unprocessed' && note.repoId) ??
      (await window.pilog.invoke('note:list')).find(
        (note) => note.status === 'unprocessed' && note.repoId
      )
    if (!firstReadyNote || !piStatus.configured || generating) return

    setOnboardingWorking(true)
    setGenerating(true)
    try {
      await window.pilog.runAgent(
        { noteIds: [firstReadyNote.id], mode: 'review' },
        async (event) => {
          if (event.type === 'final') {
            if (!mountedRef.current) return
            await Promise.all([
              fetchNotes(),
              fetchStatusCounts(),
              fetchDraftLinks(),
              fetchOnboardingNotes(),
              persistOnboardingState(completeOnboardingState(onboardingState))
            ])
            onNavigateToDraftReview()
          }
          if (event.type === 'error') {
            console.error(event.message)
          }
        }
      )
    } finally {
      if (mountedRef.current) {
        setGenerating(false)
        setOnboardingWorking(false)
        window.pilog.invoke('pi:status').then(setPiStatus)
      }
    }
  }

  const handleProcessCurrentInbox = async (): Promise<void> => {
    if (!currentInboxRepo || !canProcessCurrentInbox) return
    setCurrentInboxMessage(null)
    const sourceNoteSnapshot = await window.pilog.invoke('note:list', {
      repoId: currentInboxRepo.id,
      status: 'unprocessed'
    })
    setGenerating(true)
    try {
      const start = await window.pilog.runCurrentInboxAgent(
        { repoId: currentInboxRepo.id, mode: 'auto-publish-preview' },
        async (event) => {
          if (event.type === 'final') {
            if (!mountedRef.current) return
            await Promise.all([fetchNotes(), fetchStatusCounts(), fetchDraftLinks()])
            if (event.autoPublishPreview) {
              setAutoPublishPreview({
                open: true,
                summary: event.autoPublishPreview,
                drafts: event.drafts,
                sourceNotes: sourceNoteSnapshot,
                report: null,
                publishing: false,
                publishError: null
              })
            }
          }
          if (event.type === 'error') {
            console.error(event.message)
          }
        }
      )
      if ('skipped' in start && mountedRef.current) {
        setCurrentInboxMessage(start.reason)
        await Promise.all([fetchNotes(), fetchStatusCounts(), fetchDraftLinks()])
      }
    } finally {
      if (mountedRef.current) {
        setGenerating(false)
        window.pilog.invoke('pi:status').then(setPiStatus)
      }
    }
  }

  const handleConfirmAutoPublish = async (): Promise<void> => {
    const runId = autoPublishPreview.summary?.runId
    if (!runId || autoPublishPreview.publishing) return

    setAutoPublishPreview((prev) => ({ ...prev, publishing: true, publishError: null }))
    try {
      const report = await window.pilog.invoke('issue-drafts:publishAutoPublishRun', { runId })
      await Promise.all([fetchNotes(), fetchStatusCounts(), fetchDraftLinks()])
      if (!mountedRef.current) return
      setAutoPublishPreview((prev) => ({
        ...prev,
        report,
        publishing: false,
        publishError: null
      }))
    } catch (error) {
      if (!mountedRef.current) return
      setAutoPublishPreview((prev) => ({
        ...prev,
        publishing: false,
        publishError: error instanceof Error ? error.message : String(error)
      }))
    }
  }

  return (
    <div className="flex h-full bg-background text-foreground">
      {/*
        Sidebar — overflow-hidden + min-w-0 keep any future toolbar overflow
        contained instead of bleeding into the detail pane. The sidebar
        is structured as three regions:
          (1) filter rail (vertical status list, optional selection row,
              repo Select)
          (2) scrolling list (the only region that grows)
          (3) mode footer that swaps capture <-> triage
        View nav and global chrome (Settings, Cmd+K) live in AppShell's
        top bar, not here, so the sidebar never has to fight a tab strip
        for 320px of width.
      */}
      <div className="flex w-80 min-w-0 shrink-0 flex-col overflow-hidden border-r">
        {/* (1) Filter rail — compact status grid, optional selection
            row, then the repo Select. Each region owns its own line, so
            the moss "N selected" indicator never reflows the status
            rows when it appears. The shape echoes Things 3's sidebar
            list (PRODUCT.md names it as a reference): type-led, calm,
            and dense with signal (per-status counts) rather than chrome. */}
        <div className="flex shrink-0 flex-col gap-1 border-b px-2.5 py-2">
          <StatusFilter
            rows={STATUS_FILTER_ROWS}
            counts={statusCounts}
            active={statusFilter}
            onToggle={toggleStatus}
          />
          {/* Selection row — only renders when there's an active selection.
              Lives on its own line so the status grid above never
              reflow. The moss tint is the system's One-Voice accent
              applied deliberately: at most one of these is visible at a
              time, well within the ≤10% accent budget. Click anywhere on
              the row (or press Esc) to clear. */}
          {hasSelection ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={clearSelection}
                  aria-label={`Clear ${selectionCount} selected ${
                    selectionCount === 1 ? 'note' : 'notes'
                  }`}
                  className={cn(
                    'flex h-7 cursor-pointer items-center gap-2 rounded-md px-1.5 text-xs transition-colors',
                    'bg-primary/10 text-foreground hover:bg-primary/15',
                    'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30'
                  )}
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    aria-hidden
                    strokeWidth={2}
                    className="size-3.5 shrink-0 text-primary"
                  />
                  {/* The testid lives on the count span (not the button) so the
                      e2e suite's exact-text match against "{N} selected" stays
                      green even with the trailing "Esc" hint kbd inside the
                      same row. The button's aria-label carries the full
                      intent for assistive tech. */}
                  <span data-testid="selected-count" className="tabular flex-1 text-left">
                    {selectionCount} selected
                  </span>
                  <span
                    aria-hidden
                    className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground/80"
                  >
                    Esc
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>Clear {selectionCount} selected (Esc)</TooltipContent>
            </Tooltip>
          ) : null}
          <Select
            value={encodeRepoFilter(repoFilter)}
            onValueChange={(v) => {
              setRepoFilter(decodeRepoFilter(v))
              setSelectedIds(new Set())
              setCurrentInboxMessage(null)
              lastClickedIndex.current = null
            }}
            disabled={repos.length === 0}
          >
            <SelectTrigger
              aria-label="Filter by repository"
              data-testid="filter-repo"
              size="sm"
              className="h-7 w-full max-w-full text-xs text-muted-foreground disabled:opacity-40"
            >
              <SelectValue placeholder="All repos" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={FILTER_ALL_REPOS}>All repos</SelectItem>
                <SelectItem value={UNASSIGNED_KEY}>Unassigned</SelectItem>
                {repos.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.owner}/{r.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* (3) Scrolling list */}
        <main className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <div className="min-w-0 px-3 py-3 pe-6">
              {notes.length === 0 ? (
                <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
                  <EmptyDescription>{emptyMessage}</EmptyDescription>
                </Empty>
              ) : (
                <ul className="flex flex-col gap-1">
                  {notes.map((note, index) => {
                    const isSelected = selectedIds.has(note.id)
                    const preview = note.content.trim() || 'Untitled note'
                    const repo = note.repoId ? reposById.get(note.repoId) : undefined
                    return (
                      <li key={note.id}>
                        <button
                          type="button"
                          data-testid="note-row"
                          onClick={(e) => handleNoteClick(note.id, index, e)}
                          className={
                            'flex min-w-0 max-w-full w-full cursor-pointer items-start gap-3 overflow-hidden rounded-md border px-3 py-2.5 text-left transition-colors select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 ' +
                            (isSelected
                              ? 'border-border bg-muted'
                              : 'border-transparent hover:bg-muted/60')
                          }
                        >
                          <span className="min-w-0 flex flex-1 flex-col gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block truncate text-sm leading-snug">
                                  {preview}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{preview}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block truncate font-mono text-xs text-muted-foreground/80">
                                  {repo ? `${repo.owner}/${repo.name}` : 'Unassigned'}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {repo ? `${repo.owner}/${repo.name}` : 'Unassigned'}
                              </TooltipContent>
                            </Tooltip>
                            <span className="flex min-w-0 items-center justify-between gap-2 text-xs">
                              <Badge
                                variant="secondary"
                                className="shrink-0 font-medium text-foreground/80"
                              >
                                {STATUS_LABEL[note.status]}
                              </Badge>
                              <span className="tabular shrink-0 whitespace-nowrap text-muted-foreground">
                                {formatNoteTimestamp(note.createdAt)}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </ScrollArea>
        </main>

        {/* (4) Mode footer — capture by default, triage on selection */}
        <footer className="flex min-h-14 shrink-0 items-center border-t bg-background px-6 py-3">
          {hasSelection ? (
            // Triage-mode: draft generation (+ optional publish). Clearing the
            // selection lives on the title strip (the count chip) and on Esc.
            <div className="flex w-full flex-col gap-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex w-full">
                    <Button
                      size="sm"
                      variant={canGenerateDrafts ? 'default' : 'outline'}
                      disabled={!canGenerateDrafts}
                      className="w-full justify-center"
                      onClick={() => void handleGenerateDrafts('review')}
                    >
                      <HugeiconsIcon icon={SparklesIcon} data-icon="inline-start" aria-hidden />
                      {generating ? 'Generating' : 'Generate Drafts'}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canGenerateDrafts && <TooltipContent>{generateDraftsReason}</TooltipContent>}
              </Tooltip>
              {selectedRepo ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant={canGenerateAndPublish ? 'outline' : 'ghost'}
                        disabled={!canGenerateAndPublish}
                        className="w-full justify-center"
                        onClick={() => void handleGenerateDrafts('auto-publish-preview')}
                      >
                        <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" aria-hidden />
                        {generating ? 'Planning' : 'Generate and Publish'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canGenerateAndPublish && (
                    <TooltipContent>{generateAndPublishReason}</TooltipContent>
                  )}
                </Tooltip>
              ) : null}
              {!piStatus.configured && selectedNotesShareRepo && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto justify-start p-0 text-xs"
                  onClick={onNavigateToSettings}
                >
                  Configure Pi to generate drafts
                </Button>
              )}
            </div>
          ) : (
            <div className="flex w-full flex-col gap-1.5">
              {currentInboxRepo ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button
                        size="sm"
                        variant={canProcessCurrentInbox ? 'default' : 'outline'}
                        disabled={!canProcessCurrentInbox}
                        className="w-full justify-center"
                        onClick={() => void handleProcessCurrentInbox()}
                      >
                        <HugeiconsIcon icon={GithubIcon} data-icon="inline-start" aria-hidden />
                        {generating ? 'Planning' : 'Process Current Inbox'}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!canProcessCurrentInbox && (
                    <TooltipContent>{processCurrentInboxReason}</TooltipContent>
                  )}
                </Tooltip>
              ) : null}
              <Button
                onClick={handleNewNote}
                size="sm"
                variant={currentInboxRepo ? 'outline' : 'default'}
                className="w-full justify-center"
                data-testid="new-note-footer"
              >
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden />
                New note
              </Button>
            </div>
          )}
        </footer>
      </div>

      {/*
        Detail pane — flex-1, never a fixed width. The Editor-Gravitational
        Rule: when a note is open, the textarea is the visual centre.
      */}
      <section className="flex-1 min-w-0">
        {selectedNote ? (
          <NoteDetail
            key={selectedNote.id}
            note={selectedNote}
            repos={repos}
            onSave={handleSave}
            onDelete={handleDelete}
            onRepoChange={handleRepoChange}
            onNavigateToRepositories={onNavigateToRepositories}
            onNavigateToAgentRuns={onNavigateToAgentRuns}
            onNavigateToDraftReview={onNavigateToDraftReview}
            draftLinks={draftLinksByNote.get(selectedNote.id) ?? []}
          />
        ) : onboardingStep && !onboardingState.skipped ? (
          <OnboardingPanel
            state={onboardingState}
            step={onboardingStep}
            githubConnected={githubStatus.connected}
            repoCount={repos.length}
            piConfigured={piStatus.configured}
            noteCount={onboardingNotes.length}
            draftCount={onboardingDrafts.length}
            working={onboardingWorking || generating}
            onConfirmHotkey={handleConfirmHotkey}
            onConnectGitHub={() => void handleConnectGitHub()}
            onLinkRepo={onNavigateToRepositories}
            onConfigurePi={onNavigateToSettings}
            onCreateFirstNote={() => void handleCreateFirstNote()}
            onGenerateFirstDraft={() => void handleGenerateFirstDraft()}
            onOpenDrafts={() => onNavigateToDraftReview()}
            onSkip={handleSkipOnboarding}
          />
        ) : (
          <Empty className="h-full border-none bg-transparent shadow-none">
            <EmptyDescription className="max-w-[36ch]">{detailEmptyDescription}</EmptyDescription>
            {!onboardingState.completed && onboardingState.skipped ? (
              <Button variant="link" size="sm" className="mt-2" onClick={handleResumeOnboarding}>
                Resume first-run setup
              </Button>
            ) : null}
          </Empty>
        )}
      </section>
      <AutoPublishPreviewDialog
        open={autoPublishPreview.open}
        summary={autoPublishPreview.summary}
        drafts={autoPublishPreview.drafts}
        sourceNotes={autoPublishPreview.sourceNotes}
        report={autoPublishPreview.report}
        publishing={autoPublishPreview.publishing}
        publishError={autoPublishPreview.publishError}
        onOpenChange={(open) => setAutoPublishPreview((prev) => ({ ...prev, open }))}
        onOpenDrafts={() => {
          setAutoPublishPreview((prev) => ({ ...prev, open: false }))
          clearSelection()
          onNavigateToDraftReview()
        }}
        onPublish={() => void handleConfirmAutoPublish()}
      />
    </div>
  )
}
