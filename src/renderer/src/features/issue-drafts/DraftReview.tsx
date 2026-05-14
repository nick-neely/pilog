import {
  Cancel01Icon,
  CancelCircleIcon,
  Copy01Icon,
  FolderOpenIcon,
  GitMergeIcon,
  InformationCircleIcon,
  SplitIcon,
  Tick02Icon,
  ViewIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import type { RunNavigationOrigin } from '@renderer/features/agent-runs/navigation'
import { cn } from '@renderer/lib/utils'
import {
  getListNavigationIndex,
  shouldHandleListNavigationShortcut,
  type ListNavigationDirection
} from '@renderer/shortcuts/list-navigation'
import {
  PILOG_APP_SHORTCUTS,
  shouldEnablePublishDraftShortcut,
  usePilogHotkey
} from '@renderer/shortcuts/pilog-hotkeys'
import { PUBLISH_EGRESS_DISCLOSURE } from '@shared/data-boundaries'
import { formatRepoLocation, repoAccessFromRepo } from '@shared/repo-paths'
import { SHORTCUT_CONTRACT } from '@shared/shortcuts'
import type {
  AgentRunListItem,
  GitHubLabel,
  GitHubStatus,
  PathActionResult,
  Repo,
  UpdateIssueDraftRequest
} from '@shared/ipc'
import { matchLabelsToRepoLabels, type LabelMatch } from '@shared/labels'
import type {
  IssueDraft,
  IssueDraftForReview,
  IssueDraftSourceNote,
  IssueDraftStatus
} from '@shared/types'
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { getErrorMessage, getPublishRecoveryState, type RecoveryState } from '../recovery-state'

const EMPTY_STATUS_COUNTS: Record<IssueDraftStatus, number> = {
  draft: 0,
  dismissed: 0,
  published: 0
}

const ISSUE_DRAFT_STATUSES: readonly IssueDraftStatus[] = ['draft', 'dismissed', 'published']
type DraftReviewFilter = IssueDraftStatus | 'needs_clarification'

type DraftReviewCounts = Record<IssueDraftStatus, number> & {
  needs_clarification: number
}

const EMPTY_DRAFT_REVIEW_COUNTS: DraftReviewCounts = {
  ...EMPTY_STATUS_COUNTS,
  needs_clarification: 0
}

type RepoLabelLoadState = {
  key: string | null
  labels: GitHubLabel[]
  error: string | null
}

type ClarificationQuestionsSectionProps = {
  draft: Pick<IssueDraft, 'workflowState' | 'clarificationQuestions' | 'clarificationHistory'>
  answers?: Record<string, string>
  savingQuestion?: string | null
  message?: string | null
  error?: string | null
  onAnswerChange?: (question: string, answer: string) => void
  onSubmitAnswer?: (question: string) => Promise<void>
}

const DRAFT_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
})

function formatTimestamp(iso: string): string {
  return DRAFT_TIMESTAMP_FORMATTER.format(new Date(iso))
}

function normalizeDraftTitle(title: string): string {
  return title.trim() || 'Untitled draft'
}

function isSafeBrowserUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

function hasDraftChanges(
  draft: IssueDraft,
  next: Pick<UpdateIssueDraftRequest, 'title' | 'body' | 'labels'>
): boolean {
  if (next.title !== draft.title || next.body !== draft.body) return true
  if (next.labels.length !== draft.labels.length) return true
  return next.labels.some((label, i) => label !== draft.labels[i])
}

function draftCardClassName(selected: boolean): string {
  return cn(
    'flex w-full max-w-full min-w-0 flex-col overflow-hidden rounded-md border px-3 py-2.5 text-left',
    'transition-all duration-150 ease-[var(--ease-out-quart)] motion-reduce:transition-colors motion-reduce:duration-0',
    'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
    selected ? 'border-border bg-muted translate-x-0.5' : 'border-transparent hover:bg-muted/60'
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

/** Sidebar list rows only: keeps rhythm with inbox without long pill text. */
function confidenceSidebarShort(confidence: IssueDraft['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'High'
    case 'medium':
      return 'Med'
    case 'low':
      return 'Low'
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
    case 'copied-fallback':
      return result.fallbackPath
        ? `Copied WSL path: ${result.fallbackPath}`
        : 'Copied the WSL path instead.'
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

function workflowStateLabel(draft: IssueDraft): string {
  if (draft.workflowState === 'needs_clarification') return 'Needs clarification'
  return statusLabel(draft.status)
}

function countDraftsForReview(drafts: IssueDraft[]): DraftReviewCounts {
  const counts = { ...EMPTY_DRAFT_REVIEW_COUNTS }
  for (const draft of drafts) {
    counts[draft.status] += 1
    if (draft.status === 'draft' && draft.workflowState === 'needs_clarification') {
      counts.needs_clarification += 1
    }
  }
  return counts
}

function emptyDraftDescription(
  statusFilter: DraftReviewFilter | undefined,
  statusCounts: DraftReviewCounts
): string {
  if (totalDraftCount(statusCounts) === 0) {
    return 'Generate drafts from selected inbox notes.'
  }

  if (statusFilter === 'needs_clarification') {
    return 'No clarification drafts. Drafts that need answers will appear here.'
  }

  if (statusFilter === 'published' || statusFilter === 'dismissed') {
    return `No ${statusLabel(statusFilter).toLowerCase()} drafts.`
  }

  if (statusCounts.published > 0 && statusCounts.dismissed === 0) {
    return 'No active drafts. Published drafts stay in the Published filter for audit.'
  }

  if (statusCounts.dismissed > 0) {
    return 'No active drafts. Dismissed drafts stay local and can be inspected from the Dismissed filter.'
  }

  return 'No active drafts yet. Generate drafts from selected inbox notes to review them here.'
}

function emptyDraftTitle(
  statusFilter: DraftReviewFilter | undefined,
  statusCounts: DraftReviewCounts
): string {
  if (totalDraftCount(statusCounts) === 0) return 'No drafts yet'
  if (statusFilter === 'needs_clarification') return 'No clarification drafts'
  if (statusFilter === 'published' || statusFilter === 'dismissed') {
    return `No ${statusLabel(statusFilter).toLowerCase()} drafts`
  }
  return 'Review queue is clear'
}

function totalDraftCount(statusCounts: DraftReviewCounts): number {
  return statusCounts.draft + statusCounts.dismissed + statusCounts.published
}

function isClarificationDraft(draft: IssueDraft): boolean {
  return draft.status === 'draft' && draft.workflowState === 'needs_clarification'
}

function filterDraftsForReview(
  drafts: IssueDraftForReview[],
  statusFilter: DraftReviewFilter | undefined
): IssueDraftForReview[] {
  if (statusFilter === undefined) {
    return [...drafts].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  }

  if (statusFilter === 'needs_clarification') {
    return drafts.filter(isClarificationDraft)
  }

  return drafts.filter((draft) => draft.status === statusFilter)
}

function publishButtonLabel(input: { publishing: boolean; published: boolean }): string {
  if (input.publishing) return 'Publishing'
  if (input.published) return 'Published'
  return 'Publish'
}

function failedRunSummary(run: AgentRunListItem): string {
  const cause = run.errorCause ? ` (${run.errorCause.replaceAll('_', ' ')})` : ''
  return run.errorMessage ? `${run.errorMessage}${cause}` : `Generation failed${cause}.`
}

type PublishBlock = {
  title: string
  description: string
} & (
  | {
      actionLabel: string
      action: 'settings' | 'repositories'
    }
  | {
      actionLabel?: never
      action: null
    }
)

type DraftReviewNavigation = {
  onNavigateToInbox: () => void
  onNavigateToAgentRuns: (runId?: string, origin?: RunNavigationOrigin) => void
  onNavigateToSettings: () => void
  onNavigateToRepositories: () => void
}

function publishBlockForDraft(repo: Repo | null, githubStatus: GitHubStatus): PublishBlock | null {
  if (!githubStatus.connected) {
    return {
      title: 'GitHub is not connected.',
      description: 'Connect GitHub before publishing this local draft.',
      actionLabel: 'Open Settings',
      action: 'settings'
    }
  }

  if (!repo) {
    return {
      title: 'The linked repo is missing.',
      description: 'Reconnect the local repository before publishing this local draft.',
      actionLabel: 'Open Repositories',
      action: 'repositories'
    }
  }

  if (!repo.githubUrl) {
    return {
      title: 'This repo is not linked to GitHub.',
      description: 'Link the local repo to a GitHub repository before publishing this local draft.',
      actionLabel: 'Open Repositories',
      action: 'repositories'
    }
  }

  const githubRepo = parseGitHubRepoUrl(repo.githubUrl)
  if (githubRepo && (githubRepo.owner !== repo.owner || githubRepo.name !== repo.name)) {
    return {
      title: 'The linked GitHub repo does not match this draft.',
      description: `This draft is for ${repo.owner}/${repo.name}, but the linked URL points to ${githubRepo.owner}/${githubRepo.name}.`,
      actionLabel: 'Open Repositories',
      action: 'repositories'
    }
  }

  return null
}

function publishBlockForClarificationDraft(draft: IssueDraft): PublishBlock | null {
  if (draft.workflowState !== 'needs_clarification') return null

  return {
    title: 'This draft needs clarification.',
    description: 'Answer the questions before publishing a GitHub issue from this draft.',
    action: null
  }
}

function publishBlockActionHandler(
  block: PublishBlock,
  navigation: Pick<DraftReviewNavigation, 'onNavigateToSettings' | 'onNavigateToRepositories'>
): (() => void) | undefined {
  switch (block.action) {
    case 'settings':
      return navigation.onNavigateToSettings
    case 'repositories':
      return navigation.onNavigateToRepositories
    case null:
      return undefined
  }
}

function buildLabelMatchLookup(labelMatches?: readonly LabelMatch[]): Map<string, LabelMatch> {
  const matches = new Map<string, LabelMatch>()
  for (const match of labelMatches ?? []) {
    matches.set(match.input, match)
    matches.set(match.name, match)
  }
  return matches
}

function labelBadgeState(input: {
  label: string
  matchesByInput: Map<string, LabelMatch>
  keptUnmatchedLabels?: readonly string[]
}): {
  match: LabelMatch | undefined
  displayName: string
  kept: boolean
} {
  const match = input.matchesByInput.get(input.label)
  const kept = Boolean(match && !match.matched && input.keptUnmatchedLabels?.includes(match.name))

  if (!match) {
    return { match, displayName: input.label, kept }
  }

  return { match, displayName: match.name, kept }
}

function toggleStringInList(items: readonly string[], item: string): string[] {
  if (items.includes(item)) return items.filter((current) => current !== item)
  return [...items, item]
}

function LabelInput({
  labels,
  labelMatches,
  keptUnmatchedLabels,
  onToggleKeepUnmatched,
  onChange,
  disabled
}: {
  labels: string[]
  labelMatches?: LabelMatch[]
  keptUnmatchedLabels?: string[]
  onToggleKeepUnmatched?: (label: string) => void
  onChange: (labels: string[]) => void
  disabled?: boolean
}): React.JSX.Element {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const matchesByInput = useMemo(() => buildLabelMatchLookup(labelMatches), [labelMatches])

  const addLabel = useCallback(
    (raw: string) => {
      const label = raw.trim()
      if (!label || labels.includes(label)) return
      onChange([...labels, label])
    },
    [labels, onChange]
  )

  const removeLabel = useCallback(
    (index: number) => {
      onChange(labels.filter((_, i) => i !== index))
    },
    [labels, onChange]
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter' || event.key === 'Tab' || event.key === ',') {
        event.preventDefault()
        addLabel(value)
        setValue('')
      } else if (event.key === 'Backspace' && value === '' && labels.length > 0) {
        event.preventDefault()
        removeLabel(labels.length - 1)
      }
    },
    [addLabel, labels.length, removeLabel, value]
  )

  return (
    <div
      className={cn(
        'flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-transparent bg-input/50 px-2 py-1.5 transition-[color,box-shadow,background-color] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30',
        disabled && 'pointer-events-none cursor-not-allowed opacity-50'
      )}
      onClick={() => inputRef.current?.focus()}
    >
      {labels.map((label, index) => {
        const badge = labelBadgeState({ label, matchesByInput, keptUnmatchedLabels })
        const match = badge.match
        const isUnmatchedToggleable = match && !match.matched && !disabled && onToggleKeepUnmatched

        const badgeContent = (
          <Badge
            key={label}
            variant="secondary"
            className={cn(
              'gap-1 pr-1',
              isUnmatchedToggleable && !badge.kept && 'border-dashed border-muted-foreground/30',
              isUnmatchedToggleable && 'cursor-pointer hover:bg-secondary/80'
            )}
            {...(isUnmatchedToggleable
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-pressed': badge.kept,
                  onClick: () => onToggleKeepUnmatched!(match.name),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onToggleKeepUnmatched!(match.name)
                    }
                  }
                }
              : {})}
          >
            {isUnmatchedToggleable ? (
              <span
                className={cn(
                  'inline-flex items-center justify-center',
                  badge.kept ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <HugeiconsIcon
                  icon={badge.kept ? Tick02Icon : InformationCircleIcon}
                  className="size-3"
                  aria-hidden
                />
              </span>
            ) : null}
            <span className={cn(isUnmatchedToggleable && !badge.kept && 'text-muted-foreground')}>
              {badge.displayName}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  removeLabel(index)
                }}
                className="inline-flex items-center justify-center rounded-sm opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Remove label ${label}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" aria-hidden />
              </button>
            )}
          </Badge>
        )

        return isUnmatchedToggleable ? (
          <Tooltip key={label}>
            <TooltipTrigger asChild>{badgeContent}</TooltipTrigger>
            <TooltipContent side="bottom">
              {badge.kept
                ? 'Will be included on publish. Click to undo.'
                : 'Not in repository — will be omitted on publish. Click to keep.'}
            </TooltipContent>
          </Tooltip>
        ) : (
          badgeContent
        )
      })}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="min-w-[4rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        placeholder={labels.length === 0 ? 'Type and press Enter' : ''}
      />
    </div>
  )
}

function parseGitHubRepoUrl(url: string): { owner: string; name: string } | null {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== 'github.com') return null
    const [owner, rawName] = parsed.pathname.split('/').filter(Boolean)
    if (!owner || !rawName) return null
    return { owner, name: rawName.replace(/\.git$/, '') }
  } catch {
    return null
  }
}

export function DraftReview({
  focusDraftId,
  onFocusDraftHandled,
  onNavigateToInbox,
  onNavigateToAgentRuns,
  onNavigateToSettings,
  onNavigateToRepositories,
  onOpenSourceNote
}: DraftReviewNavigation & {
  focusDraftId?: string | null
  onFocusDraftHandled?: () => void
  onOpenSourceNote: (noteId: string) => void
}): React.JSX.Element {
  const [drafts, setDrafts] = useState<IssueDraftForReview[]>([])
  const [repos, setRepos] = useState<Repo[]>([])
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>({ connected: false })
  const [failedRuns, setFailedRuns] = useState<AgentRunListItem[]>([])
  const [statusFilter, setStatusFilter] = useState<DraftReviewFilter | undefined>(undefined)
  const [statusCounts, setStatusCounts] = useState<DraftReviewCounts>(EMPTY_DRAFT_REVIEW_COUNTS)
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null)
  const [loadingDrafts, setLoadingDrafts] = useState(true)
  const [draftsError, setDraftsError] = useState<string | null>(null)

  const fetchDrafts = useCallback(async (): Promise<void> => {
    setLoadingDrafts(true)
    setDraftsError(null)
    try {
      const [allDrafts, repoResult, githubResult, failedRunResult] = await Promise.all([
        window.pilog.invoke('issue-drafts:list', { status: 'all' }),
        window.pilog.invoke('repos:list'),
        window.pilog.invoke('github:status'),
        window.pilog.invoke('agent-runs:list', { status: 'failed', limit: 3 })
      ])
      const filteredDrafts = filterDraftsForReview(allDrafts, statusFilter)

      setDrafts(filteredDrafts)
      setRepos(repoResult)
      setGithubStatus(githubResult)
      setFailedRuns(failedRunResult)
      setStatusCounts(countDraftsForReview(allDrafts))
      setSelectedDraftId((current) => {
        if (current && filteredDrafts.some((draft) => draft.id === current)) return current
        return filteredDrafts[0]?.id ?? null
      })
    } catch (err) {
      setDrafts([])
      setDraftsError(getErrorMessage(err, 'Draft review could not be loaded.'))
      setSelectedDraftId(null)
    } finally {
      setLoadingDrafts(false)
    }
  }, [statusFilter])

  useEffect(() => {
    queueMicrotask(() => {
      void fetchDrafts()
    })
  }, [fetchDrafts])

  useEffect(() => {
    if (!focusDraftId) return
    queueMicrotask(() => {
      setStatusFilter(undefined)
      setSelectedDraftId(focusDraftId)
      onFocusDraftHandled?.()
    })
  }, [focusDraftId, onFocusDraftHandled])

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
  const selectedDraftRepo = selectedDraft ? (reposById.get(selectedDraft.repoId) ?? null) : null
  const selectedDraftPublishBlock = selectedDraft
    ? (publishBlockForClarificationDraft(selectedDraft) ??
      publishBlockForDraft(selectedDraftRepo, githubStatus))
    : null
  const emptyDescription = emptyDraftDescription(statusFilter, statusCounts)
  const emptyTitle = emptyDraftTitle(statusFilter, statusCounts)

  const handleListNavigation = useCallback(
    (event: KeyboardEvent, direction: ListNavigationDirection): void => {
      if (!shouldHandleListNavigationShortcut(event)) return

      const currentIndex = drafts.findIndex((draft) => draft.id === selectedDraftId)
      const nextIndex = getListNavigationIndex({
        currentIndex,
        itemCount: drafts.length,
        direction
      })
      const nextDraft = drafts[nextIndex]
      if (!nextDraft) return

      event.preventDefault()
      setSelectedDraftId(nextDraft.id)
    },
    [drafts, selectedDraftId]
  )

  usePilogHotkey(SHORTCUT_CONTRACT.listNext, (event) => handleListNavigation(event, 'next'), {
    enabled: drafts.length > 0
  })
  usePilogHotkey(
    SHORTCUT_CONTRACT.listPrevious,
    (event) => handleListNavigation(event, 'previous'),
    {
      enabled: drafts.length > 0
    }
  )

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-80 min-w-0 shrink-0 flex-col overflow-hidden border-r">
        <div className="shrink-0 border-b px-2.5 py-2">
          <div
            className="grid grid-cols-2 gap-x-1 gap-y-0.5"
            role="group"
            aria-label="Filter by status"
          >
            {[...ISSUE_DRAFT_STATUSES, 'needs_clarification' as const].map((status) => {
              const active = statusFilter === status
              const label =
                status === 'needs_clarification' ? 'Needs clarification' : statusLabel(status)
              const count = statusCounts[status]
              return (
                <button
                  key={status}
                  type="button"
                  data-testid={`filter-${status}`}
                  aria-pressed={active}
                  onClick={() => setStatusFilter((prev) => (prev === status ? undefined : status))}
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
                  <span className="flex-1 truncate text-left">{label}</span>
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
                    {count} {count === 1 ? 'draft' : 'drafts'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <main className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="min-w-0 px-3 py-3 pe-6">
              {loadingDrafts ? (
                <div className="flex flex-col gap-1" aria-label="Loading drafts">
                  <Skeleton className="h-24 rounded-md" />
                  <Skeleton className="h-24 rounded-md" />
                  <Skeleton className="h-24 rounded-md" />
                </div>
              ) : draftsError ? (
                <Empty className="mt-10 border-none bg-transparent p-6 shadow-none">
                  <EmptyHeader>
                    <EmptyTitle>Draft review unavailable</EmptyTitle>
                    <EmptyDescription>
                      Pilog could not read local drafts. Try loading them again before publishing.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent className="gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void fetchDrafts()}
                    >
                      Try again
                    </Button>
                    <p className="line-clamp-3 font-mono text-xs text-muted-foreground">
                      {draftsError}
                    </p>
                  </EmptyContent>
                </Empty>
              ) : drafts.length === 0 ? (
                <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
                  <EmptyDescription>{emptyDescription}</EmptyDescription>
                </Empty>
              ) : (
                <ul className="flex flex-col gap-1">
                  {drafts.map((draft) => {
                    const draftRepoEntry = reposById.get(draft.repoId)
                    const repoLine = draftRepoEntry
                      ? `${draftRepoEntry.owner}/${draftRepoEntry.name}`
                      : 'Unassigned'
                    const confidenceSidebarTooltip =
                      draft.labels.length > 0
                        ? `${confidenceLabel(draft.confidence)} · ${draft.labels.join(', ')}`
                        : confidenceLabel(draft.confidence)
                    return (
                      <li key={draft.id}>
                        <button
                          type="button"
                          data-testid="draft-row"
                          onClick={() => setSelectedDraftId(draft.id)}
                          className={draftCardClassName(selectedDraftId === draft.id)}
                        >
                          <span className="flex min-w-0 flex-col gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="min-w-0 block truncate text-sm leading-snug">
                                  {normalizeDraftTitle(draft.title)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{normalizeDraftTitle(draft.title)}</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block truncate font-mono text-xs text-muted-foreground/80">
                                  {repoLine}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{repoLine}</TooltipContent>
                            </Tooltip>
                            <span className="flex min-w-0 items-center justify-between gap-2 text-xs">
                              <Badge variant="secondary" className="font-medium text-foreground/80">
                                {workflowStateLabel(draft)}
                              </Badge>
                              <span className="tabular shrink-0 whitespace-nowrap text-muted-foreground">
                                {formatTimestamp(draft.updatedAt)}
                              </span>
                            </span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="line-clamp-2 min-w-0 break-words text-xs leading-snug">
                                  <span
                                    className="mr-1.5 inline-flex align-middle items-center rounded border border-border/55 bg-muted/40 px-1 py-px text-[11px] font-medium leading-tight text-foreground/75"
                                    aria-hidden
                                  >
                                    {confidenceSidebarShort(draft.confidence)}
                                  </span>
                                  <span className="sr-only">
                                    {confidenceLabel(draft.confidence)}
                                  </span>
                                  {draft.labels.length > 0 ? (
                                    <span className="align-middle text-muted-foreground">
                                      {draft.labels.join(' · ')}
                                    </span>
                                  ) : null}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{confidenceSidebarTooltip}</TooltipContent>
                            </Tooltip>
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
      </aside>

      <main className="min-w-0 flex-1">
        <ScrollArea className="h-full">
          {loadingDrafts ? (
            <div className="flex h-full flex-col gap-5 px-6 py-5" aria-label="Loading draft detail">
              <Skeleton className="h-10 max-w-sm rounded-md" />
              <Skeleton className="h-9 max-w-2xl rounded-md" />
              <Skeleton className="h-[28rem] max-w-3xl rounded-md" />
            </div>
          ) : selectedDraft ? (
            <DraftEditor
              key={selectedDraft.id}
              draft={selectedDraft}
              mergeCandidates={mergeCandidates}
              repo={selectedDraftRepo ?? null}
              repoPath={selectedDraftRepo?.localPath ?? null}
              publishBlock={selectedDraftPublishBlock}
              onSaved={fetchDrafts}
              onNavigateToSettings={onNavigateToSettings}
              onNavigateToRepositories={onNavigateToRepositories}
              onOpenSourceNote={onOpenSourceNote}
              onStatusChanged={fetchDrafts}
              onSplitComplete={async (newDraftId) => {
                setSelectedDraftId(newDraftId)
                await fetchDrafts()
              }}
            />
          ) : draftsError ? (
            <ReviewEmptyState
              className="h-full"
              title="Draft review unavailable"
              description="Pilog could not read local drafts. Use Try again in the draft list."
              statusFilter={statusFilter}
              statusCounts={statusCounts}
              failedRuns={failedRuns}
              onNavigateToInbox={onNavigateToInbox}
              onNavigateToAgentRuns={onNavigateToAgentRuns}
              onSetStatusFilter={setStatusFilter}
            />
          ) : drafts.length === 0 ? (
            <ReviewEmptyState
              className="h-full"
              title={emptyTitle}
              description={emptyDescription}
              statusFilter={statusFilter}
              statusCounts={statusCounts}
              failedRuns={failedRuns}
              onNavigateToInbox={onNavigateToInbox}
              onNavigateToAgentRuns={onNavigateToAgentRuns}
              onSetStatusFilter={setStatusFilter}
            />
          ) : (
            <Empty className="h-full border-none bg-transparent shadow-none">
              <EmptyDescription>
                Select a draft from the list to review and edit it.
              </EmptyDescription>
            </Empty>
          )}
        </ScrollArea>
      </main>
    </div>
  )
}

function ReviewEmptyState({
  className,
  title,
  description,
  statusFilter,
  statusCounts,
  failedRuns,
  onNavigateToInbox,
  onNavigateToAgentRuns,
  onSetStatusFilter
}: {
  className: string
  title: string
  description: string
  statusFilter: DraftReviewFilter | undefined
  statusCounts: DraftReviewCounts
  failedRuns: AgentRunListItem[]
  onNavigateToInbox: () => void
  onNavigateToAgentRuns: (runId?: string, origin?: RunNavigationOrigin) => void
  onSetStatusFilter: (status: DraftReviewFilter | undefined) => void
}): React.JSX.Element {
  return (
    <Empty className={cn('border-none bg-transparent shadow-none', className)}>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <ReviewEmptyActions
        statusFilter={statusFilter}
        statusCounts={statusCounts}
        onNavigateToInbox={onNavigateToInbox}
        onSetStatusFilter={onSetStatusFilter}
      />
      <FailedRunsNotice failedRuns={failedRuns} onNavigateToAgentRuns={onNavigateToAgentRuns} />
    </Empty>
  )
}

function ReviewEmptyActions({
  statusFilter,
  statusCounts,
  onNavigateToInbox,
  onSetStatusFilter
}: {
  statusFilter: DraftReviewFilter | undefined
  statusCounts: DraftReviewCounts
  onNavigateToInbox: () => void
  onSetStatusFilter: (status: DraftReviewFilter | undefined) => void
}): React.JSX.Element {
  const noDrafts = totalDraftCount(statusCounts) === 0

  return (
    <EmptyContent className="gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {(noDrafts || statusFilter === 'draft' || statusFilter === undefined) && (
          <Button type="button" size="sm" onClick={onNavigateToInbox}>
            Open Inbox
          </Button>
        )}
        {(statusFilter === 'draft' || statusFilter === undefined) && statusCounts.dismissed > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSetStatusFilter('dismissed')}
          >
            Show dismissed drafts
          </Button>
        ) : null}
        {(statusFilter === 'draft' || statusFilter === undefined) && statusCounts.published > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSetStatusFilter('published')}
          >
            Show published drafts
          </Button>
        ) : null}
        {(statusFilter === 'draft' || statusFilter === undefined) &&
        statusCounts.needs_clarification > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSetStatusFilter('needs_clarification')}
          >
            Show clarification drafts
          </Button>
        ) : null}
      </div>
    </EmptyContent>
  )
}

function FailedRunsNotice({
  failedRuns,
  onNavigateToAgentRuns
}: {
  failedRuns: AgentRunListItem[]
  onNavigateToAgentRuns: (runId?: string, origin?: RunNavigationOrigin) => void
}): React.JSX.Element | null {
  if (failedRuns.length === 0) return null

  const latest = failedRuns[0]

  return (
    <div className="mt-2 flex w-full max-w-sm flex-col gap-2 rounded-md border bg-muted/30 p-3 text-left">
      <div className="flex items-start gap-2">
        <HugeiconsIcon icon={InformationCircleIcon} aria-hidden className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Recent generation failed</p>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {failedRunSummary(latest)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onNavigateToAgentRuns(latest.id, { kind: 'drafts', label: 'Failed run' })}
        >
          Inspect run
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onNavigateToAgentRuns(undefined, { kind: 'history' })}
        >
          All runs
        </Button>
      </div>
    </div>
  )
}

function PublishBlocker({
  block,
  onNavigateToSettings,
  onNavigateToRepositories
}: {
  block: PublishBlock
  onNavigateToSettings: () => void
  onNavigateToRepositories: () => void
}): React.JSX.Element {
  const handleAction = publishBlockActionHandler(block, {
    onNavigateToSettings,
    onNavigateToRepositories
  })

  return (
    <div
      id="publish-blocker"
      role="status"
      aria-live="polite"
      className="mt-3 flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3 text-sm"
    >
      <div className="min-w-0">
        <p className="font-medium">{block.title}</p>
        <p className="mt-1 text-muted-foreground">{block.description}</p>
      </div>
      {block.actionLabel && handleAction ? (
        <Button type="button" variant="outline" size="sm" onClick={handleAction}>
          {block.actionLabel}
        </Button>
      ) : null}
    </div>
  )
}

function DraftEditor({
  draft,
  mergeCandidates,
  repo,
  repoPath,
  publishBlock,
  onOpenSourceNote,
  onSaved,
  onNavigateToSettings,
  onNavigateToRepositories,
  onStatusChanged,
  onSplitComplete
}: {
  draft: IssueDraftForReview
  mergeCandidates: IssueDraftForReview[]
  repo: Repo | null
  repoPath: string | null
  publishBlock: PublishBlock | null
  onOpenSourceNote: (noteId: string) => void
  onSaved: () => Promise<void>
  onNavigateToSettings: () => void
  onNavigateToRepositories: () => void
  onStatusChanged: () => Promise<void>
  onSplitComplete: (newDraftId: string) => Promise<void>
}): React.JSX.Element {
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [labels, setLabels] = useState(draft.labels)
  const [saving, setSaving] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<RecoveryState | null>(null)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(draft.githubIssueUrl)
  const [pathMessages, setPathMessages] = useState<Record<string, string>>({})
  const [splitMode, setSplitMode] = useState(false)
  const [splitSourceNoteIds, setSplitSourceNoteIds] = useState<string[]>([])
  const [splitting, setSplitting] = useState(false)
  const [splitError, setSplitError] = useState<string | null>(null)
  const [selectedMergeSourceId, setSelectedMergeSourceId] = useState<string>('')
  const [merging, setMerging] = useState(false)
  const [mergeMessage, setMergeMessage] = useState<string | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({})
  const [savingClarificationQuestion, setSavingClarificationQuestion] = useState<string | null>(
    null
  )
  const [clarificationMessage, setClarificationMessage] = useState<string | null>(null)
  const [clarificationError, setClarificationError] = useState<string | null>(null)
  const [repoLabelState, setRepoLabelState] = useState<RepoLabelLoadState>({
    key: null,
    labels: [],
    error: null
  })
  const [keptUnmatchedLabels, setKeptUnmatchedLabels] = useState<string[]>([])
  const repoAccess = useMemo(() => (repo ? repoAccessFromRepo(repo) : null), [repo])
  const repoLocation = useMemo(() => (repo ? formatRepoLocation(repo) : null), [repo])
  const repoOwner = repo?.owner ?? null
  const repoName = repo?.name ?? null
  const repoLabelRequest = useMemo(() => {
    if (!repoOwner || !repoName) return null

    return {
      key: `${repoOwner}/${repoName}`,
      owner: repoOwner,
      name: repoName
    }
  }, [repoName, repoOwner])

  useEffect(() => {
    let cancelled = false
    if (!repoLabelRequest) return

    window.pilog
      .invoke('github:listLabels', { owner: repoLabelRequest.owner, repo: repoLabelRequest.name })
      .then((labels) => {
        if (!cancelled) {
          setRepoLabelState({ key: repoLabelRequest.key, labels, error: null })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setRepoLabelState({
            key: repoLabelRequest.key,
            labels: [],
            error: error instanceof Error ? error.message : 'Could not load repo labels.'
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [repoLabelRequest])

  const repoLabelsLoading = Boolean(repoLabelRequest && repoLabelState.key !== repoLabelRequest.key)
  const repoLabelsLoaded = Boolean(
    repoLabelRequest && repoLabelState.key === repoLabelRequest.key && !repoLabelState.error
  )
  const repoLabelsError =
    repoLabelRequest && repoLabelState.key === repoLabelRequest.key ? repoLabelState.error : null
  const repoLabels = useMemo(
    () => (repoLabelsLoaded ? repoLabelState.labels : []),
    [repoLabelState.labels, repoLabelsLoaded]
  )

  const labelMatches = useMemo(
    () => matchLabelsToRepoLabels(labels, repoLabels),
    [labels, repoLabels]
  )
  const reviewedLabels = useMemo(
    () => (repoLabelsLoaded ? labelMatches.map((match) => match.name) : labels),
    [labelMatches, labels, repoLabelsLoaded]
  )
  const unmatchedLabels = useMemo(
    () => labelMatches.filter((match) => !match.matched).map((match) => match.name),
    [labelMatches]
  )
  const effectiveKeptUnmatchedLabels = useMemo(
    () => keptUnmatchedLabels.filter((label) => unmatchedLabels.includes(label)),
    [keptUnmatchedLabels, unmatchedLabels]
  )

  let publishRecoveryAction: (() => void) | null = null
  if (publishError?.intent === 'settings') {
    publishRecoveryAction = onNavigateToSettings
  } else if (publishError?.intent === 'repositories') {
    publishRecoveryAction = onNavigateToRepositories
  }

  const editedDraft = useMemo(
    () => ({
      title: normalizeDraftTitle(title),
      body,
      labels: reviewedLabels
    }),
    [body, reviewedLabels, title]
  )
  const dirty = hasDraftChanges(draft, editedDraft)
  const isPublished = draft.status === 'published'
  const canPublish = draft.status === 'draft' && !publishBlock
  const canEnterSplit = draft.status === 'draft' && draft.sourceNoteIds.length > 1
  const canSubmitSplit =
    canEnterSplit &&
    !dirty &&
    !saving &&
    !publishing &&
    splitSourceNoteIds.length > 0 &&
    draft.sourceNoteIds.length - splitSourceNoteIds.length > 0
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
        body: editedDraft.body,
        labels: editedDraft.labels
      })
      if (updated) {
        setTitle(updated.title)
        setBody(updated.body)
        setLabels(updated.labels)
        setSavedAt(formatTimestamp(updated.updatedAt))
        await onSaved()
      }
    } finally {
      setSaving(false)
    }
  }, [dirty, draft.id, editedDraft, isPublished, onSaved, saving])

  const handlePublish = useCallback(async (): Promise<void> => {
    if (publishBlock) {
      setPublishError({
        title: publishBlock.title,
        description: publishBlock.description,
        actionLabel: publishBlock.actionLabel,
        intent: publishBlock.action ?? 'none'
      })
      return
    }
    if (publishing || saving || !canPublish) return

    setPublishing(true)
    setPublishError(null)
    try {
      const published = await window.pilog.invoke('issue-drafts:publish', {
        id: draft.id,
        title: editedDraft.title,
        body: editedDraft.body,
        labels: editedDraft.labels,
        keptUnmatchedLabels: effectiveKeptUnmatchedLabels
      })
      setTitle(published.title)
      setBody(published.body)
      setLabels(published.labels)
      setSavedAt(formatTimestamp(published.updatedAt))
      setPublishedUrl(published.githubIssueUrl)
      await onSaved()
    } catch (err) {
      setPublishError(getPublishRecoveryState(err))
    } finally {
      setPublishing(false)
    }
  }, [
    canPublish,
    draft.id,
    effectiveKeptUnmatchedLabels,
    editedDraft,
    onSaved,
    publishBlock,
    publishing,
    saving
  ])

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
        setLabels(merged.labels)
        setSavedAt(formatTimestamp(merged.updatedAt))
        setMergeMessage('Merged into this draft. The other draft was moved to Dismissed.')
        await onSaved()
      }
    } catch (err) {
      setMergeError(getErrorMessage(err, 'Merge failed. Please try again.'))
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

  const handleSaveShortcut = useCallback((): void => {
    if (dirty && !saving) void handleSave()
  }, [dirty, handleSave, saving])

  const handlePathAction = useCallback(
    async (file: IssueDraft['affectedFiles'][number], action: PathAction): Promise<void> => {
      const result = await window.pilog.invoke(pathActionChannel(action), {
        path: file.path,
        repoPath,
        repoAccess
      })

      setPathMessages((current) => ({ ...current, [file.path]: pathActionMessage(result, action) }))
    },
    [repoAccess, repoPath]
  )

  const handleToggleSplitSourceNote = useCallback((noteId: string, checked: boolean): void => {
    setSplitSourceNoteIds((current) => {
      if (checked) return current.includes(noteId) ? current : [...current, noteId]
      return current.filter((id) => id !== noteId)
    })
  }, [])

  const handleSplitDraft = useCallback(async (): Promise<void> => {
    if (!canSubmitSplit || splitting) return

    setSplitting(true)
    setSplitError(null)
    try {
      const split = await window.pilog.invoke('issue-drafts:split', {
        id: draft.id,
        movedSourceNoteIds: splitSourceNoteIds
      })
      setSplitMode(false)
      setSplitSourceNoteIds([])
      await onSplitComplete(split.newDraft.id)
    } catch (err) {
      setSplitError(getErrorMessage(err, 'Split failed. Please try again.'))
    } finally {
      setSplitting(false)
    }
  }, [canSubmitSplit, draft.id, onSplitComplete, splitSourceNoteIds, splitting])

  const handleClarificationAnswerChange = useCallback((question: string, answer: string): void => {
    setClarificationAnswers((current) => ({ ...current, [question]: answer }))
  }, [])

  const handleSubmitClarificationAnswer = useCallback(
    async (question: string): Promise<void> => {
      const answer = clarificationAnswers[question]?.trim() ?? ''
      if (!answer || savingClarificationQuestion) return

      setSavingClarificationQuestion(question)
      setClarificationError(null)
      setClarificationMessage(null)
      try {
        const updated = await window.pilog.invoke('issue-drafts:addClarificationAnswer', {
          id: draft.id,
          question,
          answer
        })
        if (updated) {
          setClarificationAnswers((current) => ({ ...current, [question]: '' }))
          setSavedAt(formatTimestamp(updated.updatedAt))
          setClarificationMessage('Answer saved to clarification history.')
          await onSaved()
        }
      } catch (err) {
        setClarificationError(getErrorMessage(err, 'Answer could not be saved.'))
      } finally {
        setSavingClarificationQuestion(null)
      }
    },
    [clarificationAnswers, draft.id, onSaved, savingClarificationQuestion]
  )

  usePilogHotkey(PILOG_APP_SHORTCUTS.save, () => handleSaveShortcut(), {
    allowInEditable: true
  })
  usePilogHotkey(SHORTCUT_CONTRACT.publishDraft, () => void handlePublish(), {
    enabled: shouldEnablePublishDraftShortcut({ canPublish, publishing, saving })
  })

  return (
    <article className="flex min-h-full flex-col">
      <header className="shrink-0 border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="tabular font-mono text-xs text-muted-foreground">
              Updated {formatTimestamp(draft.updatedAt)}
            </p>
            <h2 className="mt-1 text-balance font-heading text-2xl font-medium leading-snug tracking-tight">
              Draft Review
            </h2>
          </div>
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:flex-nowrap">
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
              aria-describedby={publishBlock ? 'publish-blocker' : undefined}
              onClick={() => void handlePublish()}
            >
              <HugeiconsIcon icon={ViewIcon} data-icon="inline-start" aria-hidden />
              {publishButtonLabel({ publishing, published: isPublished })}
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
          <Alert variant="destructive" className="mt-3 max-w-2xl rounded-md">
            <AlertTitle>{publishError.title}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>{publishError.description}</span>
              {publishError.actionLabel && publishRecoveryAction ? (
                <span>
                  <Button type="button" variant="outline" size="sm" onClick={publishRecoveryAction}>
                    {publishError.actionLabel}
                  </Button>
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {publishBlock ? (
          <PublishBlocker
            block={publishBlock}
            onNavigateToSettings={onNavigateToSettings}
            onNavigateToRepositories={onNavigateToRepositories}
          />
        ) : null}
        {!isPublished ? (
          <p
            data-testid="publish-boundary-disclosure"
            className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground"
          >
            {PUBLISH_EGRESS_DISCLOSURE}
          </p>
        ) : null}
        {publishedUrl ? (
          <p
            className="mt-3 flex min-w-0 max-w-2xl flex-wrap items-baseline gap-x-1 gap-y-0.5 text-xs leading-relaxed text-muted-foreground"
            aria-live="polite"
          >
            <span className="shrink-0">Published to</span>
            {isSafeBrowserUrl(publishedUrl) ? (
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 max-w-full truncate font-mono text-primary underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {publishedUrl}
              </a>
            ) : (
              <span className="min-w-0 max-w-full truncate font-mono">{publishedUrl}</span>
            )}
          </p>
        ) : null}
      </header>

      <div className="grid flex-1 gap-6 px-6 py-5 lg:grid-cols-[1fr_20rem] xl:grid-cols-[1fr_22rem]">
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
            <LabelInput
              labels={labels}
              labelMatches={repoLabelsLoaded ? labelMatches : undefined}
              keptUnmatchedLabels={effectiveKeptUnmatchedLabels}
              onToggleKeepUnmatched={(label) => {
                setKeptUnmatchedLabels((current) => toggleStringInList(current, label))
              }}
              onChange={setLabels}
              disabled={isPublished}
            />
            {repoLabelsLoading ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Matching labels against {repo?.owner}/{repo?.name}.
              </p>
            ) : repoLabelsError ? (
              <p className="text-xs leading-relaxed text-muted-foreground" role="status">
                Could not check repo labels. Publish will check again before writing to GitHub.
              </p>
            ) : unmatchedLabels.length > 0 ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Labels not found in the repository are omitted on publish. Click the info icon on a
                label to keep it.
              </p>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="draft-body" className="text-sm font-medium">
              Body
            </label>
            <Textarea
              id="draft-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="min-h-[28rem] font-mono text-sm leading-relaxed"
              disabled={isPublished}
            />
          </div>
        </form>

        <aside className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{workflowStateLabel(draft)}</Badge>
            <Badge variant="outline">{confidenceLabel(draft.confidence)}</Badge>
          </div>

          <ClarificationQuestionsSection
            draft={draft}
            answers={clarificationAnswers}
            savingQuestion={savingClarificationQuestion}
            message={clarificationMessage}
            error={clarificationError}
            onAnswerChange={handleClarificationAnswerChange}
            onSubmitAnswer={handleSubmitClarificationAnswer}
          />

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Why this grouping</h3>
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {draft.groupingReason || 'No grouping reason recorded.'}
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Source Notes</h3>
              {canEnterSplit ? (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setSplitError(null)
                    setSplitMode((current) => !current)
                    setSplitSourceNoteIds([])
                  }}
                >
                  <HugeiconsIcon icon={SplitIcon} data-icon="inline-start" aria-hidden />
                  {splitMode ? 'Cancel split' : 'Split'}
                </Button>
              ) : null}
            </div>
            {splitMode ? (
              <div className="rounded-md border bg-muted/30 p-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Select the notes that should move into a new draft.
                </p>
                {dirty ? (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Save changes before splitting so both drafts start from the reviewed content.
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="xs"
                    disabled={!canSubmitSplit || splitting}
                    onClick={() => void handleSplitDraft()}
                  >
                    <HugeiconsIcon icon={SplitIcon} data-icon="inline-start" aria-hidden />
                    {splitting ? 'Splitting' : 'Create split draft'}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {splitSourceNoteIds.length} moving,{' '}
                    {draft.sourceNoteIds.length - splitSourceNoteIds.length} staying
                  </span>
                </div>
                {splitError ? (
                  <p className="mt-2 text-xs leading-relaxed text-destructive" role="alert">
                    {splitError}
                  </p>
                ) : null}
              </div>
            ) : null}
            <SourceNotesList
              draft={draft}
              onOpenSourceNote={onOpenSourceNote}
              splitMode={splitMode}
              selectedSourceNoteIds={splitSourceNoteIds}
              onToggleSplitSourceNote={handleToggleSplitSourceNote}
            />
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Affected Files</h3>
              {repoLocation?.context ? (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {repoLocation.context}
                </p>
              ) : null}
            </div>
            {draft.affectedFiles.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {draft.affectedFiles.map((file) => (
                  <li
                    key={`${file.path}:${file.reason}`}
                    className="group flex min-w-0 flex-col gap-1 py-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="break-all font-mono text-xs">{file.path}</p>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => void handlePathAction(file, 'copy')}
                              aria-label="Copy path"
                            >
                              <HugeiconsIcon icon={Copy01Icon} className="size-3.5" aria-hidden />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy path</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => void handlePathAction(file, 'reveal')}
                              aria-label="Reveal in explorer"
                            >
                              <HugeiconsIcon
                                icon={FolderOpenIcon}
                                className="size-3.5"
                                aria-hidden
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {repoAccess?.kind === 'wsl'
                              ? 'Reveal in Explorer, or copy the WSL path'
                              : 'Reveal in explorer'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {file.reason}
                    </p>
                    {pathMessages[file.path] ? (
                      <p className="text-xs text-muted-foreground" role="status">
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
        </aside>
      </div>
    </article>
  )
}

export function ClarificationQuestionsSection({
  draft,
  answers = {},
  savingQuestion = null,
  message = null,
  error = null,
  onAnswerChange,
  onSubmitAnswer
}: ClarificationQuestionsSectionProps): React.JSX.Element | null {
  const hasQuestions =
    draft.workflowState === 'needs_clarification' && draft.clarificationQuestions.length > 0
  const hasHistory = draft.clarificationHistory.length > 0
  const canAnswerQuestions = Boolean(onAnswerChange && onSubmitAnswer)
  if (!hasQuestions && !hasHistory) {
    return null
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="clarification-questions-heading">
      <h3 id="clarification-questions-heading" className="text-sm font-semibold">
        Clarification Questions
      </h3>
      {hasQuestions ? (
        <div className="rounded-md border bg-muted/30 p-3">
          <ul className="flex flex-col gap-3">
            {draft.clarificationQuestions.map((question, index) => {
              const answer = answers[question] ?? ''
              const answerId = `clarification-answer-${index}`
              return (
                <li key={question} className="flex flex-col gap-2">
                  <label htmlFor={answerId} className="text-sm leading-relaxed text-foreground/90">
                    {question}
                  </label>
                  {canAnswerQuestions ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        id={answerId}
                        value={answer}
                        onChange={(event) => onAnswerChange?.(question, event.target.value)}
                        className="min-h-20 text-sm leading-relaxed"
                        placeholder="Write an answer"
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!answer.trim() || Boolean(savingQuestion)}
                          onClick={() => void onSubmitAnswer?.(question)}
                        >
                          <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" aria-hidden />
                          {savingQuestion === question ? 'Saving' : 'Save answer'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {message ? (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-xs leading-relaxed text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      {hasHistory ? (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-muted-foreground">Clarification History</h4>
          <ol className="flex flex-col divide-y divide-border rounded-md border bg-background">
            {draft.clarificationHistory.map((entry) => (
              <li key={`${entry.answeredAt}:${entry.question}`} className="flex flex-col gap-1 p-3">
                <p className="text-sm leading-relaxed text-foreground/90">{entry.question}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">{entry.answer}</p>
                <time
                  dateTime={entry.answeredAt}
                  className="tabular text-xs text-muted-foreground/80"
                >
                  {formatTimestamp(entry.answeredAt)}
                </time>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
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
  onOpenSourceNote,
  splitMode,
  selectedSourceNoteIds,
  onToggleSplitSourceNote
}: {
  draft: IssueDraftForReview
  onOpenSourceNote: (noteId: string) => void
  splitMode: boolean
  selectedSourceNoteIds: string[]
  onToggleSplitSourceNote: (noteId: string, checked: boolean) => void
}): React.JSX.Element {
  const sourceNotesById = new Map(draft.sourceNotes.map((note) => [note.id, note]))
  const selected = new Set(selectedSourceNoteIds)

  if (draft.sourceNoteIds.length === 0) {
    return <p className="text-sm text-muted-foreground">No source notes recorded.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {draft.sourceNoteIds.map((id) => {
        const note = sourceNotesById.get(id)
        return note ? (
          <SourceNoteItem
            key={id}
            note={note}
            onOpenSourceNote={onOpenSourceNote}
            splitMode={splitMode}
            selected={selected.has(id)}
            onToggleSplitSourceNote={onToggleSplitSourceNote}
          />
        ) : (
          <UnavailableSourceNoteItem
            key={id}
            id={id}
            splitMode={splitMode}
            selected={selected.has(id)}
            onToggleSplitSourceNote={onToggleSplitSourceNote}
          />
        )
      })}
    </ul>
  )
}

function SourceNoteItem({
  note,
  onOpenSourceNote,
  splitMode,
  selected,
  onToggleSplitSourceNote
}: {
  note: IssueDraftSourceNote
  onOpenSourceNote: (noteId: string) => void
  splitMode: boolean
  selected: boolean
  onToggleSplitSourceNote: (noteId: string, checked: boolean) => void
}): React.JSX.Element {
  const preview = note.content.trim() || 'Untitled note'

  if (splitMode) {
    return (
      <li className={cn('flex min-w-0 items-start gap-2 py-2', selected && 'bg-muted/40')}>
        <Checkbox
          id={`split-source-note-${note.id}`}
          checked={selected}
          onCheckedChange={(checked) => onToggleSplitSourceNote(note.id, checked === true)}
          aria-label={`Move source note ${note.id.slice(0, 8)} into the split draft`}
          className="mt-1"
        />
        <label htmlFor={`split-source-note-${note.id}`} className="min-w-0 flex-1 cursor-pointer">
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="text-xs">
              {note.status}
            </Badge>
            <span className="tabular text-xs text-muted-foreground">
              {formatTimestamp(note.createdAt)}
            </span>
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {note.id.slice(0, 8)}
            </span>
          </span>
          <span className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground/90">
            {preview}
          </span>
        </label>
      </li>
    )
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenSourceNote(note.id)}
        className={cn(
          'flex w-full min-w-0 flex-col py-2 text-left transition-colors',
          'hover:bg-muted/40 focus-visible:rounded-md focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30'
        )}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-xs">
            {note.status}
          </Badge>
          <span className="tabular text-xs text-muted-foreground">
            {formatTimestamp(note.createdAt)}
          </span>
          <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
            {note.id.slice(0, 8)}
          </span>
        </span>
        <span className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-foreground/90">
          {preview}
        </span>
      </button>
    </li>
  )
}

function UnavailableSourceNoteItem({
  id,
  splitMode,
  selected,
  onToggleSplitSourceNote
}: {
  id: string
  splitMode: boolean
  selected: boolean
  onToggleSplitSourceNote: (noteId: string, checked: boolean) => void
}): React.JSX.Element {
  if (splitMode) {
    return (
      <li className={cn('flex min-w-0 items-start gap-2 py-2', selected && 'bg-muted/40')}>
        <Checkbox
          id={`split-source-note-${id}`}
          checked={selected}
          onCheckedChange={(checked) => onToggleSplitSourceNote(id, checked === true)}
          aria-label={`Move unavailable source note ${id} into the split draft`}
          className="mt-1"
        />
        <label htmlFor={`split-source-note-${id}`} className="min-w-0 flex-1 cursor-pointer">
          <span className="block font-mono text-xs text-muted-foreground">{id}</span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Source note is no longer available.
          </span>
        </label>
      </li>
    )
  }

  return (
    <li className="py-2">
      <p className="font-mono text-xs text-muted-foreground">{id}</p>
      <p className="mt-1 text-xs text-muted-foreground">Source note is no longer available.</p>
    </li>
  )
}
