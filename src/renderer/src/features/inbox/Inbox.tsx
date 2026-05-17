import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  FilePenIcon,
  GithubIcon,
  InformationCircleIcon,
  Settings02Icon,
  Undo02Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { HotkeyInput } from '@renderer/components/HotkeyInput'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
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
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { Empty, EmptyDescription } from '@renderer/components/ui/empty'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@renderer/components/ui/hover-card'
import { Kbd, KbdGroup } from '@renderer/components/ui/kbd'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { Progress } from '@renderer/components/ui/progress'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Separator } from '@renderer/components/ui/separator'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Textarea } from '@renderer/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import type { RunNavigationOrigin } from '@renderer/features/agent-runs/navigation'
import { cn } from '@renderer/lib/utils'
import {
  getListNavigationIndex,
  getSelectedListNavigationIndex,
  shouldHandleListNavigationShortcut,
  type ListNavigationDirection
} from '@renderer/shortcuts/list-navigation'
import {
  hasOpenTransientUi,
  PILOG_APP_SHORTCUTS,
  shouldClearSelectionForContextualEscape,
  shouldEnableGenerateDraftsShortcut,
  usePilogHotkey,
  usePilogHotkeySequence
} from '@renderer/shortcuts/pilog-hotkeys'
import {
  AUTO_PUBLISH_EGRESS_DISCLOSURE,
  GENERATION_EGRESS_DISCLOSURE,
  LOCAL_FIRST_DISCLOSURE
} from '@shared/data-boundaries'
import type {
  GenerateDraftsMode,
  GitHubStatus,
  ListNotesRequest,
  Note,
  NoteStatus,
  NoteStatusCounts,
  OnboardingState,
  PiStatus,
  Repo
} from '@shared/ipc'
import {
  applyRepoDraftSettingsOverride,
  isIssueStyleAudience,
  isIssueStyleDepth,
  normalizeRepoDraftSettings,
  type RepoDraftSettings,
  type UpdateRepoDraftSettingsRequest
} from '@shared/ipc'
import type { LabelMatch } from '@shared/labels'
import {
  completeOnboardingState,
  confirmHotkeyOnboardingState,
  getCompletedOnboardingSteps,
  getVisibleOnboardingStep,
  ONBOARDING_STEP_ORDER,
  resumeOnboardingState,
  skipOnboardingState,
  type OnboardingSignals,
  type OnboardingStepId
} from '@shared/onboarding'
import { formatRepoLocation, type RepoLocationDisplay } from '@shared/repo-paths'
import {
  DEFAULT_GLOBAL_CAPTURE_SHORTCUT,
  formatShortcutForDisplay,
  getShortcutDisplayPlatform,
  SHORTCUT_CONTRACT
} from '@shared/shortcuts'
import type {
  AutoPublishPreviewSummary,
  AutoPublishPublishReport,
  AutoPublishSkippedDraft,
  AutoPublishUndoReport,
  GeneratedIssueDraft,
  IssueDraftForReview,
  IssueDraftStatus
} from '@shared/types'
import { Fragment, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import {
  getErrorMessage,
  getGenerationRecoveryState,
  getPublishRecoveryState,
  type RecoveryState
} from '../recovery-state'
import {
  DRAFT_CONTENT_TOGGLE_LABELS,
  draftSettingsSummary
} from '../repositories/repo-draft-defaults'
import {
  getGenerationRepoIndexStatus,
  type GenerationRepoIndexStatusView
} from '../repositories/repo-index-status'
import { mergeGitHubAuthProgress } from '../setup/github-auth-progress'
import { GitHubDeviceCode } from '../setup/GitHubDeviceCode'
import { PiSetupPanel } from '../setup/PiSetupPanel'
import { RepoLinkFlow } from '../setup/RepoLinkFlow'
import { usePiConfig, type PiConfigState } from '../setup/use-pi-config'
import { INBOX_NOTE_PREVIEW_TOOLTIP_CLASS } from './inbox-note-preview-tooltip'
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

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return YEAR_NOTE_TIMESTAMP_FORMATTER.format(date)
}

function formatCaptureContext(note: Note): string | null {
  const context = note.captureContext
  if (!context) return null
  if (context.state === 'unavailable') return 'Context unavailable'

  const parts: string[] = []
  if (context.branch) parts.push(context.branch)
  if (context.headSha) {
    const shortSha = context.headSha.slice(0, 7)
    parts.push(context.headSubject ? `${shortSha} ${context.headSubject}` : shortSha)
  }
  const changedCount = new Set([...context.dirtyFiles, ...context.stagedFiles]).size
  if (changedCount > 0) parts.push(`${changedCount} changed`)
  return parts.length > 0 ? parts.join(' · ') : 'Context captured'
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

type DraftSettingsOverrideState = {
  repoId: string
  settings: RepoDraftSettings
}

type DraftSettingsMessageState = {
  repoId: string
  message: string
}

type AutoPublishPreviewState = {
  open: boolean
  summary: AutoPublishPreviewSummary | null
  drafts: GeneratedIssueDraft[]
  sourceNotes: Note[]
  report: AutoPublishPublishReport | null
  publishing: boolean
  undoing: boolean
  publishError: string | null
}

type OnboardingPanelProps = {
  state: OnboardingState
  step: OnboardingStepId
  signals: OnboardingSignals
  working: boolean
  hotkey: string | null
  hotkeyDraft: string
  hotkeyDirty: boolean
  noteDraft: string
  generationPhase: string | null
  generationError: string | null
  draftPreview: OnboardingDraftPreview | null
  repo: Repo | null
  pi: PiConfigState
  onConfirmHotkey: () => void
  onHotkeyChange: (value: string) => void
  onSaveHotkey: () => void
  onConnectGitHub: () => void
  onRepoLinked: () => Promise<void> | void
  onPiConfigured: () => Promise<void> | void
  onGitHubRequired: () => void
  onNoteDraftChange: (value: string) => void
  onCreateFirstNote: () => Promise<void> | void
  onGenerateFirstDraft: () => Promise<void> | void
  onOpenDrafts: () => Promise<void> | void
  onSkip: () => void
}

type OnboardingDraftPreview = {
  title: string
  summary: string
  labels: string[]
  confidence: 'low' | 'medium' | 'high'
  affectedFiles: Array<{ path: string; reason: string }>
  acceptanceCriteria: string[]
}

type GenerationErrorState = RecoveryState & {
  message: string
}

function NoteRepoIndexIndicator({
  status
}: {
  status: GenerationRepoIndexStatusView
}): React.JSX.Element {
  const dotClass =
    status.state === 'fresh'
      ? 'bg-primary'
      : status.state === 'stale'
        ? 'bg-foreground/40'
        : 'bg-foreground/25'
  const indicator = (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      role="status"
      aria-label={status.ariaLabel}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', dotClass)} />
      <span className="tabular">{status.shortLabel}</span>
    </span>
  )
  if (!status.notice) return indicator
  return (
    <Tooltip>
      <TooltipTrigger asChild>{indicator}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{status.notice}</TooltipContent>
    </Tooltip>
  )
}

function getGenerationErrorState(input: {
  message: string
  cause?: string | null
}): GenerationErrorState {
  return {
    ...getGenerationRecoveryState(input),
    message: input.message
  }
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

  linksByNote.forEach((links) => {
    links.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  })

  return linksByNote
}

function getActiveDraftSettings(
  repo: Repo | null,
  override: RepoDraftSettings | null
): RepoDraftSettings | null {
  if (!repo) return null
  if (override) return normalizeRepoDraftSettings(override)
  return normalizeRepoDraftSettings(repo)
}

function hasDraftSettingsChanges(repo: Repo | null, active: RepoDraftSettings | null): boolean {
  if (!repo || !active) return false
  if (active.issueStyleDepth !== repo.issueStyleDepth) return true
  if (active.issueStyleAudience !== repo.issueStyleAudience) return true

  return DRAFT_CONTENT_TOGGLE_LABELS.some(
    ({ key }) => active.draftContentToggles[key] !== repo.draftContentToggles[key]
  )
}

function getDraftSettingsStatusMessage(input: {
  repo: Repo
  hasOverride: boolean
  message: string | null
}): string {
  if (input.message) return input.message
  if (input.hasOverride) return 'Overrides apply to this run only until saved.'
  return `Repo default for ${input.repo.owner}/${input.repo.name}.`
}

function getDraftSettingsForRun(repo: Repo, override: RepoDraftSettings | null): RepoDraftSettings {
  return normalizeRepoDraftSettings(applyRepoDraftSettingsOverride(repo, override ?? undefined))
}

function getGenerateDraftsReason(input: {
  hasSelection: boolean
  selectedNotesShareRepo: boolean
  selectedNotesAllUnprocessed: boolean
  selectedRepoAvailable: boolean
  piStatus: PiStatus
  generating: boolean
}): string {
  if (input.generating) return 'Generating drafts for the selected notes.'
  if (!input.hasSelection) return 'Select one or more notes to generate drafts.'
  if (!input.selectedNotesAllUnprocessed) return 'Selected notes have already been drafted.'
  if (!input.selectedNotesShareRepo) return 'Selected notes must share one linked repository.'
  if (!input.selectedRepoAvailable) return 'Relink the repository before generating drafts.'
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
  return 'Generate through your Pi provider, then review planned GitHub writes.'
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

const ONBOARDING_STEP_TITLES: Record<OnboardingStepId, string> = {
  hotkey: 'Set your capture hotkey',
  github: 'Connect GitHub',
  repo: 'Link a local repository',
  pi: 'Configure Pi',
  note: 'Capture your first note',
  draft: 'Generate your first draft',
  review: 'Review and publish'
}

const ONBOARDING_STEP_DESCRIPTIONS: Record<OnboardingStepId, string> = {
  hotkey:
    'A global hotkey opens the scratchpad from anywhere. Press it, jot a thought, and get back to work.',
  github:
    'Pilog writes issues to GitHub on your behalf. Connect your account so drafts can become real issues.',
  repo: 'Link a local git repository so Pilog can read your codebase and write repo-aware issue drafts.',
  pi: 'Pi provides the agent that turns your rough notes into structured issue drafts. Choose a provider and model.',
  note: 'Capture a quick thought about something you noticed: a broken button, a missing test, a refactor idea.',
  draft:
    'Let Pi read your note and bounded repository context, then produce a structured issue draft with title, body, and suggested labels.',
  review:
    'Review the generated draft, edit if needed, and publish it as a GitHub issue when you are ready.'
}

function OnboardingPanel({
  state,
  step: currentStep,
  signals,
  working,
  hotkey,
  hotkeyDraft,
  hotkeyDirty,
  noteDraft,
  generationPhase,
  generationError,
  draftPreview,
  repo,
  pi,
  onConfirmHotkey,
  onHotkeyChange,
  onSaveHotkey,
  onConnectGitHub,
  onRepoLinked,
  onPiConfigured,
  onGitHubRequired,
  onNoteDraftChange,
  onCreateFirstNote,
  onGenerateFirstDraft,
  onOpenDrafts,
  onSkip
}: OnboardingPanelProps): React.JSX.Element {
  const [displayedStep, setDisplayedStep] = useState<OnboardingStepId>(currentStep)

  const completedSteps = getCompletedOnboardingSteps(state, signals)
  const currentIndex = ONBOARDING_STEP_ORDER.indexOf(currentStep)
  const displayedIndex = ONBOARDING_STEP_ORDER.indexOf(displayedStep)
  const progressValue = ((displayedIndex + 1) / ONBOARDING_STEP_ORDER.length) * 100
  const repoLocation = repo ? formatRepoLocation(repo) : null

  const handleBack = (): void => {
    if (displayedIndex > 0) {
      setDisplayedStep(ONBOARDING_STEP_ORDER[displayedIndex - 1])
    }
  }

  const handleContinue = (): void => {
    if (displayedIndex < ONBOARDING_STEP_ORDER.length - 1) {
      setDisplayedStep(ONBOARDING_STEP_ORDER[displayedIndex + 1])
    }
  }

  const handleStepDotClick = (stepId: OnboardingStepId): void => {
    const stepIndex = ONBOARDING_STEP_ORDER.indexOf(stepId)
    if (stepIndex <= currentIndex) {
      setDisplayedStep(stepId)
    }
  }

  const handleRepoLinked = (): void => {
    void Promise.resolve(onRepoLinked()).finally(() => {
      setDisplayedStep(currentStep)
    })
  }

  const handlePiConfigured = (): void => {
    void Promise.resolve(onPiConfigured()).finally(() => {
      setDisplayedStep(currentStep)
    })
  }

  const handleNoteCreated = (): void => {
    void Promise.resolve(onCreateFirstNote()).finally(() => {
      setDisplayedStep(currentStep)
    })
  }

  const handleDraftGenerated = (): void => {
    void Promise.resolve(onGenerateFirstDraft()).finally(() => {
      setDisplayedStep(currentStep)
    })
  }

  const action = getOnboardingAction({
    step: displayedStep,
    currentStep,
    working,
    onConfirmHotkey,
    onConnectGitHub,
    onCreateFirstNote: handleNoteCreated,
    onGenerateFirstDraft: handleDraftGenerated,
    onOpenDrafts,
    onContinue: handleContinue
  })

  const shortcutPlatform =
    typeof navigator === 'undefined' ? 'linux' : getShortcutDisplayPlatform(navigator.platform)
  const displayHotkey = formatShortcutForDisplay(
    hotkey || DEFAULT_GLOBAL_CAPTURE_SHORTCUT,
    shortcutPlatform
  )
  const noteReady = noteDraft.trim().length > 0
  const generationRunning = displayedStep === 'draft' && working
  const preview = draftPreview ?? getLatestOnboardingDraftPreview(signals.drafts)
  const generationPhaseInfo = generationPhase
    ? formatOnboardingGenerationPhase(generationPhase)
    : null
  const hasExistingDraft = Boolean(preview) || signals.drafts.length > 0

  return (
    <section
      data-testid="onboarding-panel"
      aria-labelledby="onboarding-title"
      className="flex h-full w-full flex-col items-center overflow-y-auto px-6 py-10"
    >
      <div className="m-auto flex w-full max-w-lg flex-col gap-6">
        {/* Progress with inline navigation */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleBack}
                disabled={working || displayedIndex <= 0}
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors',
                  displayedIndex > 0
                    ? 'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'
                    : 'invisible'
                )}
                aria-label="Previous step"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3" aria-hidden />
              </button>
              <p className="text-xs font-medium text-muted-foreground">
                Step {displayedIndex + 1} of {ONBOARDING_STEP_ORDER.length}
              </p>
              <button
                type="button"
                onClick={handleContinue}
                disabled={working || displayedIndex >= currentIndex}
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors',
                  displayedIndex < currentIndex
                    ? 'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30'
                    : 'invisible'
                )}
                aria-label="Next step"
              >
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3" aria-hidden />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {completedSteps.size} of {ONBOARDING_STEP_ORDER.length} complete
            </p>
          </div>
          <Progress value={progressValue} className="h-1.5" />
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-2">
          {ONBOARDING_STEP_ORDER.map((id) => {
            const done = completedSteps.has(id)
            const current = id === displayedStep
            const clickable = done || id === currentStep
            return (
              <button
                key={id}
                type="button"
                data-testid={`onboarding-step-${id}`}
                onClick={() => clickable && handleStepDotClick(id)}
                className={cn(
                  'size-2 rounded-full transition-colors',
                  current ? 'bg-primary' : done ? 'bg-primary/40' : 'bg-muted',
                  clickable && 'cursor-pointer hover:ring-2 hover:ring-primary/30'
                )}
                aria-current={current ? 'step' : undefined}
                disabled={!clickable}
                aria-label={`Step ${id}${done ? ' (completed)' : ''}`}
              />
            )
          })}
        </div>

        {/* Title and description */}
        <div className="flex flex-col gap-2 text-center">
          <h2
            id="onboarding-title"
            className="font-heading text-2xl font-normal leading-tight tracking-tight"
          >
            {ONBOARDING_STEP_TITLES[displayedStep]}
          </h2>
          <p className="mx-auto max-w-[50ch] text-sm leading-relaxed text-muted-foreground">
            {ONBOARDING_STEP_DESCRIPTIONS[displayedStep]}
          </p>
          <p
            data-testid="onboarding-local-first-disclosure"
            className="mx-auto max-w-[58ch] text-xs leading-5 text-muted-foreground"
          >
            {LOCAL_FIRST_DISCLOSURE}
          </p>
        </div>

        {/* Step-specific content */}
        <div className="flex flex-col items-center gap-3">
          {displayedStep === 'hotkey' ? (
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted px-6 py-4">
                <KbdGroup>
                  {displayHotkey.split(' + ').map((key, i, arr) => (
                    <Fragment key={`${key}-${i}`}>
                      <Kbd className="text-sm">{key}</Kbd>
                      {i < arr.length - 1 && <span className="text-muted-foreground">+</span>}
                    </Fragment>
                  ))}
                </KbdGroup>
              </div>
              <p className="max-w-[42ch] text-center text-xs text-muted-foreground">
                Press this combination to open the scratchpad from anywhere. Try it now, or change
                it if you prefer something else.
              </p>
              <div className="flex w-full max-w-sm flex-col gap-1.5 text-left">
                <Label htmlFor="onboarding-hotkey">Capture hotkey</Label>
                <div className="flex items-center gap-2">
                  <HotkeyInput
                    id="onboarding-hotkey"
                    value={hotkeyDraft}
                    onHotkeyChange={onHotkeyChange}
                    placeholder={DEFAULT_GLOBAL_CAPTURE_SHORTCUT}
                    className="font-mono"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onSaveHotkey}
                    disabled={!hotkeyDirty || working}
                  >
                    Save
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Press the keys you want, then save.</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={action.onClick} disabled={working}>
                  {action.label}
                </Button>
              </div>
            </div>
          ) : displayedStep === 'repo' ? (
            <div className="w-full max-w-md">
              <RepoLinkFlow
                idleLabel="Link a local repo"
                onLinked={handleRepoLinked}
                onGitHubRequired={onGitHubRequired}
              />
            </div>
          ) : displayedStep === 'pi' ? (
            <div className="w-full text-left">
              <PiSetupPanel
                pi={pi}
                description="Choose the provider, model, and API key Pilog should use for draft generation. Credentials stay in OS-backed safe storage."
                onConfigured={handlePiConfigured}
              />
            </div>
          ) : displayedStep === 'note' ? (
            <div className="flex w-full flex-col gap-3 text-left">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="onboarding-first-note">First note</Label>
                <Textarea
                  id="onboarding-first-note"
                  data-testid="onboarding-note-input"
                  value={noteDraft}
                  onChange={(event) => onNoteDraftChange(event.target.value)}
                  placeholder="Example: The settings save button needs a loading state."
                  className="min-h-28 resize-none font-mono text-sm leading-relaxed"
                  disabled={working}
                />
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Write the kind of rough thought you would normally lose mid-flow. Pilog keeps it as
                the source for the draft.
              </p>
              <div className="flex justify-center">
                <Button
                  onClick={handleNoteCreated}
                  disabled={working || !noteReady}
                  className="min-w-[10rem]"
                >
                  Save note
                </Button>
              </div>
            </div>
          ) : displayedStep === 'draft' ? (
            <div className="flex w-full flex-col gap-4 text-left">
              {generationRunning ? (
                <div className="rounded-md border bg-muted/35 p-4" aria-live="polite">
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-foreground">Generating draft</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {generationPhaseInfo?.label ?? 'Reading your note and repository context.'}
                    </p>
                    {generationPhaseInfo ? (
                      <Progress value={generationPhaseInfo.progress} className="h-1.5" />
                    ) : (
                      <Progress indeterminate className="h-1.5" />
                    )}
                  </div>
                </div>
              ) : hasExistingDraft ? (
                <>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <p className="text-sm font-medium text-foreground">Draft generated</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Pi read your note and produced a structured issue draft. Review it on the next
                      step before publishing.
                    </p>
                  </div>
                  {preview ? (
                    <div className="rounded-md border bg-muted/20 p-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="capitalize">
                            {preview.confidence} confidence
                          </Badge>
                          {preview.labels.slice(0, 3).map((label) => (
                            <Badge key={label} variant="outline">
                              {label}
                            </Badge>
                          ))}
                        </div>
                        <h3 className="text-base font-medium leading-snug text-foreground">
                          {preview.title}
                        </h3>
                        <p className="text-sm leading-6 text-muted-foreground">{preview.summary}</p>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex justify-center">
                    <Button
                      onClick={handleContinue}
                      disabled={working}
                      className="min-w-[12rem]"
                      size="lg"
                    >
                      Continue to review
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-md border bg-muted/30 p-4">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">Ready to draft</p>
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Data sharing information"
                          >
                            <HugeiconsIcon
                              icon={InformationCircleIcon}
                              className="size-4"
                              aria-hidden
                            />
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent side="top" className="w-80 rounded-xl">
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Data sharing</p>
                            <Separator />
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {GENERATION_EGRESS_DISCLOSURE}
                            </p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      You will review the draft before anything is published.
                    </p>
                  </div>
                  {generationError ? (
                    <Alert variant="destructive" className="rounded-md">
                      <AlertTitle>Draft generation needs attention</AlertTitle>
                      <AlertDescription>{generationError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="flex justify-center">
                    <Button
                      onClick={action.onClick}
                      disabled={working}
                      className="min-w-[12rem]"
                      size="lg"
                    >
                      {action.label}
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : displayedStep === 'review' && preview ? (
            <div className="flex w-full flex-col gap-4 text-left">
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {preview.confidence} confidence
                    </Badge>
                    {preview.labels.slice(0, 3).map((label) => (
                      <Badge key={label} variant="outline">
                        {label}
                      </Badge>
                    ))}
                  </div>
                  <h3 className="text-base font-medium leading-snug text-foreground">
                    {preview.title}
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">{preview.summary}</p>
                </div>
                {preview.affectedFiles.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-foreground">Likely area</p>
                    {repoLocation?.context ? (
                      <p className="text-xs leading-5 text-muted-foreground">
                        {repoLocation.context}
                      </p>
                    ) : null}
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {preview.affectedFiles[0].path}
                    </p>
                  </div>
                ) : null}
                {preview.acceptanceCriteria.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-foreground">First check</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {preview.acceptanceCriteria[0]}
                    </p>
                  </div>
                ) : null}
              </div>
              <p className="text-center text-xs leading-5 text-muted-foreground">
                The full draft, source note, files, labels, and review details are saved.
              </p>
              <div className="flex justify-center">
                <Button onClick={action.onClick} disabled={working} className="min-w-[12rem]">
                  {action.label}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex w-full flex-col items-center gap-3">
              {displayedStep === 'github' && signals.github.auth?.state === 'device_code' ? (
                <GitHubDeviceCode auth={signals.github.auth} className="w-full max-w-md" />
              ) : displayedStep === 'github' && getGitHubAuthText(signals.github) ? (
                <div
                  className="w-full max-w-md rounded-md border bg-muted/30 p-3"
                  aria-live="polite"
                >
                  <p className="text-xs leading-5 text-muted-foreground">
                    {getGitHubAuthText(signals.github)}
                  </p>
                </div>
              ) : null}
              <Button
                onClick={action.onClick}
                disabled={working}
                className="min-w-[12rem]"
                size="lg"
              >
                {working && (
                  <span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                )}
                {action.label}
              </Button>
            </div>
          )}
        </div>

        <Separator className="w-full max-w-xs self-center" />

        {/* Skip */}
        <div className="flex justify-center">
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={working}>
            Skip setup for now
          </Button>
        </div>
      </div>
    </section>
  )
}

function getOnboardingAction(input: {
  step: OnboardingStepId
  currentStep: OnboardingStepId
  working: boolean
  onConfirmHotkey: () => void
  onConnectGitHub: () => void
  onCreateFirstNote: () => Promise<void> | void
  onGenerateFirstDraft: () => Promise<void> | void
  onOpenDrafts: () => Promise<void> | void
  onContinue: () => void
}): { label: string; onClick: () => Promise<void> | void } {
  // When viewing a completed step that is not the current active step,
  // offer Continue to walk forward instead of repeating the action.
  if (input.step !== input.currentStep) {
    return { label: 'Continue', onClick: input.onContinue }
  }

  switch (input.step) {
    case 'hotkey':
      return { label: 'This works for me', onClick: input.onConfirmHotkey }
    case 'github':
      return {
        label: input.working ? 'Connecting…' : 'Connect GitHub',
        onClick: input.onConnectGitHub
      }
    case 'repo':
      return { label: 'Link a local repo', onClick: () => undefined }
    case 'pi':
      return { label: 'Configure Pi', onClick: () => undefined }
    case 'note':
      return { label: 'Save note', onClick: input.onCreateFirstNote }
    case 'draft':
      return {
        label: input.working ? 'Generating…' : 'Generate first draft',
        onClick: input.onGenerateFirstDraft
      }
    case 'review':
      return { label: 'Open full draft', onClick: input.onOpenDrafts }
  }
}

function getGitHubAuthText(status: GitHubStatus): string | null {
  const auth = status.auth
  if (!auth) return null
  if (auth.state === 'device_code') {
    return `Enter ${auth.userCode} at ${auth.verificationUri}.`
  }
  if (auth.state === 'authorized') return `Connected as ${auth.login}.`
  return 'message' in auth ? auth.message : null
}

function getLatestOnboardingDraftPreview(
  drafts: IssueDraftForReview[]
): OnboardingDraftPreview | null {
  const draft = drafts[0]
  if (!draft) return null
  return {
    title: draft.title,
    summary: firstBodyParagraph(draft.body) || draft.groupingReason,
    labels: draft.labels,
    confidence: draft.confidence,
    affectedFiles: draft.affectedFiles,
    acceptanceCriteria: extractAcceptanceCriteria(draft.body)
  }
}

function generatedDraftToOnboardingPreview(draft: GeneratedIssueDraft): OnboardingDraftPreview {
  return {
    title: draft.title,
    summary: draft.summary,
    labels: draft.suggestedLabels,
    confidence: draft.confidence,
    affectedFiles: draft.affectedFiles,
    acceptanceCriteria: draft.acceptanceCriteria
  }
}

function formatOnboardingGenerationPhase(phase: string): { label: string; progress: number } {
  const phaseMap: Record<string, { label: string; progress: number }> = {
    preparing: { label: 'Preparing your first draft.', progress: 5 },
    agent_start: { label: 'Starting the draft run.', progress: 10 },
    turn_start: { label: 'Reading your note and repository context.', progress: 35 },
    submit_issue_drafts: { label: 'Saving the generated issue draft.', progress: 80 }
  }
  return (
    phaseMap[phase] ?? {
      label: `Working through ${phase.replace(/[_-]/g, ' ')}.`,
      progress: 50
    }
  )
}

function firstBodyParagraph(body: string): string {
  return (
    body
      .split(/\n{2,}/)
      .map((part) => part.replace(/^#+\s+.+\n/, '').trim())
      .find((part) => part.length > 0 && !part.startsWith('#')) ?? ''
  )
}

function extractAcceptanceCriteria(body: string): string[] {
  const heading = /^##\s+Acceptance Criteria\s*$/im.exec(body)
  if (!heading) return []
  const afterHeading = body.slice(heading.index + heading[0].length)
  const nextHeadingIndex = afterHeading.search(/^##\s+/m)
  const section = nextHeadingIndex === -1 ? afterHeading : afterHeading.slice(0, nextHeadingIndex)
  return section
    .split(/\n{2,}/)
    .join('\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
}

type NoteDetailDraftSettings = {
  activeSettings: RepoDraftSettings
  hasOverride: boolean
  statusMessage: string | null
  repoIndexStatus: GenerationRepoIndexStatusView | null
  savingDefault: boolean
  disabled: boolean
  onUpdate: (settings: RepoDraftSettings) => void
  onSaveAsDefault: () => void
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
  draftLinks,
  draftSettings
}: {
  note: Note
  repos: Repo[]
  draftLinks: NoteDraftLink[]
  draftSettings?: NoteDetailDraftSettings
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
  const assignedRepo = note.repoId ? (repos.find((r) => r.id === note.repoId) ?? null) : null
  const repoIndexStatus = assignedRepo ? getGenerationRepoIndexStatus(assignedRepo) : null
  const captureContextLabel = formatCaptureContext(note)

  const handleSave = useCallback(async (): Promise<void> => {
    await onSave(note.id, draft)
  }, [draft, note.id, onSave])
  const handleSaveShortcut = useCallback((): void => {
    if (dirty) void handleSave()
  }, [dirty, handleSave])

  // Mod+S saves this note even while focus is in the note textarea. That
  // shortcut is an explicit editor-surface opt-in, unlike navigation keys.
  usePilogHotkey(PILOG_APP_SHORTCUTS.save, () => handleSaveShortcut(), {
    allowInEditable: true
  })

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
      <div className="flex-1 min-h-0 overflow-hidden">
        <Textarea
          aria-label="Note content"
          // Body line length capped at 72ch per DESIGN.md; mono editor body
          // pairs with the rest of the system (file paths, code blocks).
          className="mx-auto block h-full w-full max-w-[72ch] resize-none overflow-auto rounded-none border-0 bg-transparent p-6 font-mono text-sm leading-relaxed text-foreground shadow-none focus-visible:ring-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Capture a thought…"
        />
      </div>
      {/* Repo and generation provenance, kept secondary to the editor body. */}
      <footer className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-6 py-3">
        <div className="flex min-w-0 items-center gap-x-3 overflow-hidden">
          {draftSettings ? (
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      disabled={draftSettings.disabled}
                      aria-label={`Draft settings: ${draftSettingsSummary(draftSettings.activeSettings)}${draftSettings.hasOverride ? ' (overrides active)' : ''}`}
                      className={cn(
                        'relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors',
                        'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                        'disabled:opacity-50'
                      )}
                    >
                      <HugeiconsIcon icon={Settings02Icon} className="size-3.5" aria-hidden />
                      {draftSettings.hasOverride && (
                        <span
                          className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-1 ring-background"
                          aria-hidden
                        />
                      )}
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{draftSettingsSummary(draftSettings.activeSettings)}</p>
                  {draftSettings.hasOverride && (
                    <p className="text-xs text-primary">Overrides active for this run</p>
                  )}
                </TooltipContent>
              </Tooltip>
              <PopoverContent align="start" className="w-84 gap-3 rounded-xl">
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">Draft settings</p>
                  {draftSettings.statusMessage ? (
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {draftSettings.statusMessage}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={draftSettings.activeSettings.issueStyleDepth}
                    onValueChange={(value) => {
                      if (!isIssueStyleDepth(value)) return
                      draftSettings.onUpdate({
                        ...draftSettings.activeSettings,
                        issueStyleDepth: value
                      })
                    }}
                    disabled={draftSettings.disabled}
                  >
                    <SelectTrigger
                      className="h-8 rounded-md text-xs"
                      aria-label="Issue style depth"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="concise">Concise</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="detailed">Detailed</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Select
                    value={draftSettings.activeSettings.issueStyleAudience}
                    onValueChange={(value) => {
                      if (!isIssueStyleAudience(value)) return
                      draftSettings.onUpdate({
                        ...draftSettings.activeSettings,
                        issueStyleAudience: value
                      })
                    }}
                    disabled={draftSettings.disabled}
                  >
                    <SelectTrigger
                      className="h-8 rounded-md text-xs"
                      aria-label="Issue style audience"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="internal">Internal</SelectItem>
                        <SelectItem value="open_source">Open source</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {DRAFT_CONTENT_TOGGLE_LABELS.map((item) => (
                    <label
                      key={item.key}
                      htmlFor={`note-${item.key}-${note.id}`}
                      className="flex min-w-0 items-center gap-2 rounded-sm px-1 py-0.5 text-xs"
                    >
                      <Checkbox
                        id={`note-${item.key}-${note.id}`}
                        checked={draftSettings.activeSettings.draftContentToggles[item.key]}
                        disabled={draftSettings.disabled}
                        onCheckedChange={(checked) =>
                          draftSettings.onUpdate({
                            ...draftSettings.activeSettings,
                            draftContentToggles: {
                              ...draftSettings.activeSettings.draftContentToggles,
                              [item.key]: checked === true
                            }
                          })
                        }
                        aria-label={item.label}
                      />
                      <span className="min-w-0 break-words leading-snug">{item.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={!draftSettings.hasOverride || draftSettings.savingDefault}
                    onClick={() => void draftSettings.onSaveAsDefault()}
                  >
                    {draftSettings.savingDefault ? 'Saving' : 'Save as default'}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          <span className="shrink-0 text-xs font-medium text-muted-foreground">Repo</span>
          {repos.length === 0 ? (
            <span className="shrink-0 text-xs text-muted-foreground">
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
                className="max-w-[min(100%,14rem)] shrink-0 text-xs"
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
          {repoIndexStatus ? (
            <span className="flex h-8 shrink-0 items-center">
              <NoteRepoIndexIndicator status={repoIndexStatus} />
            </span>
          ) : null}
          {captureContextLabel ? (
            <span className="flex h-8 items-center">
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {captureContextLabel}
              </span>
            </span>
          ) : null}
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
  repo,
  sourceNotes,
  report,
  publishing,
  publishError,
  undoing,
  onOpenChange,
  onOpenDrafts,
  onPublish,
  onUndo
}: {
  open: boolean
  summary: AutoPublishPreviewSummary | null
  drafts: GeneratedIssueDraft[]
  repo: Repo | null
  sourceNotes: Note[]
  report: AutoPublishPublishReport | null
  publishing: boolean
  undoing: boolean
  publishError: string | null
  onOpenChange: (open: boolean) => void
  onOpenDrafts: () => void
  onPublish: () => void
  onUndo: () => void
}): React.JSX.Element {
  const sourceNotesById = useMemo(
    () => new Map(sourceNotes.map((note) => [note.id, note])),
    [sourceNotes]
  )
  const title = getAutoPublishDialogTitle(summary, report)
  const description = getAutoPublishDialogDescription(summary, report)
  const repoLocation = repo ? formatRepoLocation(repo) : null
  const undoComplete =
    report?.undo !== undefined && report.undo.successCount > 0 && report.undo.failureCount === 0
  const undoLabel = getAutoPublishUndoButtonLabel({ undoing, undoComplete })

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-h-[min(42rem,calc(100vh-4rem))] max-w-3xl !flex min-h-0 !flex-col gap-0 overflow-hidden p-0"
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <div className="flex shrink-0 flex-col gap-4 px-6 pt-6">
          <AlertDialogHeader className="gap-3">
            <div className="flex w-full min-w-0 items-center gap-2">
              <AlertDialogTitle className="min-w-0 flex-1 text-left">{title}</AlertDialogTitle>
              {summary?.dryRun && !report ? <DryRunPublishInfoHoverCard /> : null}
            </div>
            {description ? (
              <AlertDialogDescription className="text-left">{description}</AlertDialogDescription>
            ) : null}
          </AlertDialogHeader>
          {publishError ? (
            <div role="alert" className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
              {publishError}
            </div>
          ) : null}
          {summary && !report ? (
            <div role="status">
              <PlanMetaSummary summary={summary} />
            </div>
          ) : null}
        </div>
        {report ? (
          <div className="min-h-0 flex-1 overflow-hidden px-6">
            <AutoPublishReport report={report} sourceNotesById={sourceNotesById} />
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden px-6">
            <ScrollArea className="h-full max-h-full pe-3">
              <div className="flex flex-col gap-5 pb-4">
                {summary && !summary.dryRun ? (
                  <p
                    data-testid="auto-publish-boundary-disclosure"
                    className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground"
                  >
                    {AUTO_PUBLISH_EGRESS_DISCLOSURE}
                  </p>
                ) : null}
                {summary && summary.skippedDrafts.length > 0 ? (
                  <SkippedDraftsSummary skippedDrafts={summary.skippedDrafts} />
                ) : null}
                {drafts.map((draft, index) => (
                  <DraftPreviewCard
                    key={`${draft.title}-${index}`}
                    draft={draft}
                    repoLocation={repoLocation}
                    sourceNotesById={sourceNotesById}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
        <AlertDialogFooter className="shrink-0 border-t border-border/60 bg-popover px-6 py-4">
          <AlertDialogCancel disabled={publishing || undoing}>Close</AlertDialogCancel>
          {report ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={undoing || report.successes.length === 0 || undoComplete}
                onClick={onUndo}
              >
                <HugeiconsIcon icon={Undo02Icon} className="size-4" aria-hidden />
                {undoLabel}
              </Button>
              <AlertDialogAction onClick={onOpenDrafts}>Open Drafts</AlertDialogAction>
            </>
          ) : summary?.dryRun ? (
            <AlertDialogAction onClick={onOpenDrafts}>Open Drafts</AlertDialogAction>
          ) : (
            <AlertDialogAction
              disabled={publishing || !summary || summary.plannedDraftCount === 0}
              onClick={onPublish}
            >
              {publishing ? 'Publishing' : 'Publish to GitHub'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function getAutoPublishUndoButtonLabel(input: { undoing: boolean; undoComplete: boolean }): string {
  if (input.undoing) return 'Closing issues'
  if (input.undoComplete) return 'Issues Closed'
  return 'Publish Undo'
}

function SkippedDraftsSummary({
  skippedDrafts
}: {
  skippedDrafts: AutoPublishSkippedDraft[]
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <h3 className="text-sm font-semibold">Skipped drafts</h3>
      <ul className="flex flex-col gap-2">
        {skippedDrafts.map((draft) => (
          <li key={`${draft.title}:${draft.reason}`} className="flex flex-col gap-0.5">
            <p className="text-sm font-medium leading-snug">{draft.title}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{draft.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DryRunPublishInfoHoverCard(): React.JSX.Element {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-testid="dry-run-publish-disclosure"
          className="inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dry run publish information"
        >
          <HugeiconsIcon icon={InformationCircleIcon} className="size-4" aria-hidden />
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="w-80 rounded-xl">
        <div className="space-y-2">
          <p className="text-sm font-medium">Preview only</p>
          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Pilog planned these drafts locally. Nothing is written to GitHub until you publish from
            Drafts. Open Drafts to review or edit before closing.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function PlanMetaSummary({ summary }: { summary: AutoPublishPreviewSummary }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-1.5 rounded-full bg-primary/60" aria-hidden />
        <span>
          {summary.plannedDraftCount} planned of {summary.generatedDraftCount}
        </span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-1.5 rounded-full bg-primary/60" aria-hidden />
        <span>Limit {summary.maxIssuesPerRun}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-1.5 rounded-full bg-primary/60" aria-hidden />
        <span>Label {summary.defaultLabel}</span>
      </span>
    </div>
  )
}

function ConfidenceBadge({ confidence }: { confidence: string }): React.JSX.Element {
  const indicatorClass =
    confidence === 'low'
      ? 'bg-destructive/70'
      : confidence === 'medium'
        ? 'bg-primary/60'
        : 'bg-primary/80'

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('inline-block size-1.5 rounded-full', indicatorClass)} aria-hidden />
      <span className="capitalize">Confidence {confidence}</span>
    </span>
  )
}

function DraftPreviewCard({
  draft,
  repoLocation,
  sourceNotesById
}: {
  draft: GeneratedIssueDraft
  repoLocation: RepoLocationDisplay | null
  sourceNotesById: Map<string, Note>
}): React.JSX.Element {
  return (
    <section className="rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h3 className="max-w-[52ch] text-base font-semibold leading-snug">{draft.title}</h3>
          <ConfidenceBadge confidence={draft.confidence} />
        </div>
        <p className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
          {draft.summary}
        </p>
        <DraftLabelBadges labels={draft.suggestedLabels} labelMatches={draft.labelMatches} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Source notes</p>
            <SourceNoteList
              noteIds={draft.sourceNoteIds}
              sourceNotesById={sourceNotesById}
              itemClassName="line-clamp-2 text-sm leading-relaxed"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Affected files</p>
            {repoLocation?.context ? (
              <p className="text-xs leading-5 text-muted-foreground">{repoLocation.context}</p>
            ) : null}
            <ul className="flex flex-col gap-1.5">
              {draft.affectedFiles.map((file) => (
                <li key={file.path} className="min-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="truncate font-mono text-xs">{file.path}</p>
                    </TooltipTrigger>
                    <TooltipContent className="font-mono">{file.path}</TooltipContent>
                  </Tooltip>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{file.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function DraftLabelBadges({
  labels,
  labelMatches
}: {
  labels: string[]
  labelMatches?: LabelMatch[]
}): React.JSX.Element {
  const badges = labelBadgesForPreview(labels, labelMatches)

  return (
    <div className="flex flex-wrap gap-1.5">
      {badges.map((label) => (
        <Badge
          key={`${label.input}:${label.name}`}
          variant={label.matched ? 'secondary' : 'outline'}
          className="gap-1"
        >
          <span>{label.name}</span>
          {!label.matched ? (
            <span className="text-[10px] text-muted-foreground">omitted</span>
          ) : null}
        </Badge>
      ))}
    </div>
  )
}

function labelBadgesForPreview(
  labels: readonly string[],
  labelMatches?: readonly LabelMatch[]
): LabelMatch[] {
  if (labelMatches && labelMatches.length > 0) return [...labelMatches]

  return labels.map((label) => ({
    input: label,
    name: label,
    matched: true
  }))
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
): string | null {
  if (report) {
    return `${report.successCount} published, ${report.skippedCount} skipped, ${report.failureCount} failed.`
  }

  if (!summary) {
    return 'Pilog planned these drafts for review before any GitHub writes.'
  }

  const message = summary.message.trim()
  return message || null
}

function AutoPublishReport({
  report,
  sourceNotesById
}: {
  report: AutoPublishPublishReport
  sourceNotesById: Map<string, Note>
}): React.JSX.Element {
  return (
    <ScrollArea className="h-full max-h-full pe-3">
      <div className="flex flex-col gap-5 pb-4" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>
            Repo {report.repo.owner}/{report.repo.name}
          </span>
          <span>Run {report.runId}</span>
          <span>{formatDateTime(report.publishedAt)}</span>
        </div>
        {report.undo ? <AutoPublishUndoSummary undo={report.undo} /> : null}
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
                    <ReportLabels labels={item.labels} />
                    <SourceNoteList
                      noteIds={item.sourceNoteIds}
                      sourceNotesById={sourceNotesById}
                      itemClassName="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {report.skippedDrafts.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Skipped before GitHub</h3>
            <ul className="flex flex-col gap-2">
              {report.skippedDrafts.map((item, index) => (
                <li
                  key={`${item.title}:${item.reason}:${index}`}
                  className="rounded-md border bg-muted/30 p-3"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="max-w-[52ch] text-sm font-medium leading-snug">{item.title}</p>
                      <Badge variant="outline">Skipped</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.reason}</p>
                    <ReportLabels labels={item.labels} />
                    <SourceNoteList
                      noteIds={item.sourceNoteIds}
                      sourceNotesById={sourceNotesById}
                      itemClassName="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
                    />
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
                      <ReportLabels labels={item.labels} />
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

function AutoPublishUndoSummary({ undo }: { undo: AutoPublishUndoReport }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">Publish Undo</h3>
          <p className="text-sm text-muted-foreground">
            {undo.successCount} closed, {undo.failureCount} failed.
          </p>
        </div>
        <Badge variant={undo.failureCount > 0 ? 'outline' : 'secondary'}>
          {undo.failureCount > 0 ? 'Partial' : 'Audited'}
        </Badge>
      </div>
      {undo.failures.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {undo.failures.map((failure) => (
            <li key={`${failure.githubIssueNumber}:${failure.stage}`} className="text-sm">
              <p className="font-medium leading-snug">{failure.title}</p>
              <p className="text-muted-foreground">
                Issue #{failure.githubIssueNumber}: {failure.stage} failed. {failure.error}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function ReportLabels({ labels }: { labels: string[] }): React.JSX.Element | null {
  if (labels.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Labels applied">
      {labels.map((label) => (
        <Badge key={label} variant="secondary" className="max-w-full font-mono text-[0.7rem]">
          {label}
        </Badge>
      ))}
    </div>
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
              <TooltipContent className={INBOX_NOTE_PREVIEW_TOOLTIP_CLASS}>
                {preview}
              </TooltipContent>
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
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null)
  const [onboardingNotes, setOnboardingNotes] = useState<Note[]>([])
  const [onboardingDrafts, setOnboardingDrafts] = useState<IssueDraftForReview[]>([])
  const [onboardingHotkey, setOnboardingHotkey] = useState<string | null>(null)
  const [onboardingHotkeyDraft, setOnboardingHotkeyDraft] = useState('')
  const [onboardingHotkeyEdited, setOnboardingHotkeyEdited] = useState(false)
  const [onboardingNoteDraft, setOnboardingNoteDraft] = useState('')
  const [onboardingGenerationPhase, setOnboardingGenerationPhase] = useState<string | null>(null)
  const [onboardingGenerationError, setOnboardingGenerationError] = useState<string | null>(null)
  const [onboardingDraftPreview, setOnboardingDraftPreview] =
    useState<OnboardingDraftPreview | null>(null)
  const [githubStatus, setGitHubStatus] = useState<GitHubStatus>({ connected: false })
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
    undoing: false,
    publishError: null
  })
  const [statusFilter, setStatusFilter] = useState<NoteStatus | undefined>()
  const [repoFilter, setRepoFilter] = useState<string | null | undefined>(undefined)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [currentInboxMessage, setCurrentInboxMessage] = useState<string | null>(null)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [notesError, setNotesError] = useState<string | null>(null)
  const [generationError, setGenerationError] = useState<GenerationErrorState | null>(null)
  const [pendingDeleteNote, setPendingDeleteNote] = useState<Note | null>(null)
  const lastClickedIndex = useRef<number | null>(null)
  const fetchIdRef = useRef(0)
  const countsFetchIdRef = useRef(0)
  const mountedRef = useRef(true)
  const onboardingPi = usePiConfig()

  const reposById = useMemo(() => new Map(repos.map((r) => [r.id, r])), [repos])
  const onboardingSignals = useMemo<OnboardingSignals>(
    () => ({
      github: githubStatus,
      repos,
      pi: piStatus,
      notes: onboardingNotes,
      drafts: onboardingDrafts
    }),
    [githubStatus, onboardingDrafts, onboardingNotes, piStatus, repos]
  )
  const onboardingStep = getVisibleOnboardingStep(onboardingState, onboardingSignals)
  const shouldShowOnboarding = onboardingState !== null && onboardingStep !== null

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
    window.pilog.invoke('setting:get', { key: 'hotkey.scratchpad' }).then((value) => {
      setOnboardingHotkey(value)
      setOnboardingHotkeyDraft(value ?? '')
    })
  }, [])

  useEffect(() => {
    return window.pilog.onGitHubAuthProgress((auth) => {
      setGitHubStatus((current) => mergeGitHubAuthProgress(current, auth))
    })
  }, [])

  const fetchNotes = useCallback(async (): Promise<void> => {
    const id = ++fetchIdRef.current
    setLoadingNotes(true)
    setNotesError(null)
    await window.pilog
      .invoke('note:list', buildFilter(statusFilter, '', repoFilter))
      .then((result) => {
        if (id !== fetchIdRef.current) return
        setNotes(result)
        setSelectedIds((prev) => {
          const validIds = new Set(result.map((n) => n.id))
          const next = new Set(Array.from(prev).filter((rid) => validIds.has(rid)))
          return next.size === prev.size ? prev : next
        })
      })
      .catch((err) => {
        if (id !== fetchIdRef.current) return
        setNotes([])
        setNotesError(getErrorMessage(err, 'Inbox notes could not be loaded.'))
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoadingNotes(false)
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
    void Promise.resolve().then(fetchNotes)
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
    queueMicrotask(() => {
      void fetchOnboardingNotes()
    })
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

  const completeOnboardingIfNeeded = useCallback(async (): Promise<void> => {
    if (!onboardingState || onboardingState.completed) return
    await persistOnboardingState(completeOnboardingState(onboardingState))
  }, [onboardingState, persistOnboardingState])

  const handleConfirmHotkey = useCallback(async (): Promise<void> => {
    if (!onboardingState) return
    if (onboardingHotkeyEdited && onboardingHotkeyDraft !== (onboardingHotkey ?? '')) {
      await window.pilog.invoke('setting:set', {
        key: 'hotkey.scratchpad',
        value: onboardingHotkeyDraft
      })
      setOnboardingHotkey(onboardingHotkeyDraft)
      setOnboardingHotkeyEdited(false)
    }
    await persistOnboardingState(confirmHotkeyOnboardingState(onboardingState))
  }, [
    onboardingHotkey,
    onboardingHotkeyDraft,
    onboardingHotkeyEdited,
    onboardingState,
    persistOnboardingState
  ])

  const handleOnboardingHotkeyChange = useCallback((value: string): void => {
    setOnboardingHotkeyEdited(true)
    setOnboardingHotkeyDraft(value)
  }, [])

  const handleSaveOnboardingHotkey = useCallback(async (): Promise<void> => {
    await window.pilog.invoke('setting:set', {
      key: 'hotkey.scratchpad',
      value: onboardingHotkeyDraft
    })
    setOnboardingHotkey(onboardingHotkeyDraft)
    setOnboardingHotkeyEdited(false)
  }, [onboardingHotkeyDraft])

  const handleSkipOnboarding = useCallback((): void => {
    if (!onboardingState) return
    void persistOnboardingState(skipOnboardingState(onboardingState))
  }, [onboardingState, persistOnboardingState])

  const handleResumeOnboarding = useCallback((): void => {
    if (!onboardingState) return
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

  const handleOnboardingRepoLinked = useCallback(async (): Promise<void> => {
    const nextRepos = await window.pilog.invoke('repos:list')
    setRepos(nextRepos)
  }, [])

  const handleOnboardingGitHubRequired = useCallback((): void => {
    setGitHubStatus({ connected: false })
  }, [])

  const handleOnboardingPiConfigured = useCallback(async (): Promise<void> => {
    setPiStatus(await window.pilog.invoke('pi:status'))
  }, [])

  const handleCreateFirstNote = useCallback(async (): Promise<void> => {
    const content = onboardingNoteDraft.trim()
    if (!content) return
    const firstRepo = repos[0]
    const created = await window.pilog.invoke('note:create', {
      content,
      repoId: firstRepo?.id ?? null
    })
    setOnboardingGenerationError(null)
    setOnboardingDraftPreview(null)
    await Promise.all([fetchNotes(), fetchStatusCounts(), fetchOnboardingNotes()])
    requestAnimationFrame(() => setSelectedIds(new Set([created.id])))
  }, [fetchNotes, fetchOnboardingNotes, fetchStatusCounts, onboardingNoteDraft, repos])

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

  const focusNote = useCallback((noteId: string, index: number): void => {
    setSelectedIds(new Set([noteId]))
    lastClickedIndex.current = index
  }, [])

  const handleCopyNoteContent = useCallback(async (note: Note): Promise<void> => {
    const content = note.content.trim()
    if (!content) return
    await navigator.clipboard.writeText(content)
  }, [])

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
  const selectedRepoId = selectedNotesShareRepo ? selectedNotes[0]?.repoId : null
  const selectedRepo = selectedRepoId ? (reposById.get(selectedRepoId) ?? null) : null
  const currentInboxRepo =
    typeof repoFilter === 'string' ? (reposById.get(repoFilter) ?? null) : null
  const draftSettingsRepo = selectedRepo ?? (!hasSelection ? currentInboxRepo : null)
  const draftSettingsRepoId = draftSettingsRepo?.id ?? null
  const [draftSettingsOverrideState, setDraftSettingsOverrideState] =
    useState<DraftSettingsOverrideState | null>(null)
  const [savingDraftSettingsDefault, setSavingDraftSettingsDefault] = useState(false)
  const [draftSettingsMessageState, setDraftSettingsMessageState] =
    useState<DraftSettingsMessageState | null>(null)
  const draftSettingsOverride =
    draftSettingsOverrideState?.repoId === draftSettingsRepoId
      ? draftSettingsOverrideState.settings
      : null
  const draftSettingsMessage =
    draftSettingsMessageState?.repoId === draftSettingsRepoId
      ? draftSettingsMessageState.message
      : null
  const activeDraftSettings = getActiveDraftSettings(draftSettingsRepo, draftSettingsOverride)
  const hasDraftSettingsOverride = hasDraftSettingsChanges(draftSettingsRepo, activeDraftSettings)
  const draftSettingsStatusMessage = draftSettingsRepo
    ? getDraftSettingsStatusMessage({
        repo: draftSettingsRepo,
        hasOverride: hasDraftSettingsOverride,
        message: draftSettingsMessage
      })
    : null
  const canGenerateDrafts =
    hasSelection &&
    selectedNotesAllUnprocessed &&
    selectedNotesShareRepo &&
    Boolean(selectedRepo) &&
    piStatus.configured &&
    !generating
  const generateDraftsReason = getGenerateDraftsReason({
    hasSelection,
    selectedNotesShareRepo,
    selectedNotesAllUnprocessed,
    selectedRepoAvailable: Boolean(selectedRepo),
    piStatus,
    generating
  })
  const canGenerateAndPublish = canGenerateDrafts && selectedRepo?.autoPublishEnabled === true
  const canProcessCurrentInbox =
    !hasSelection &&
    Boolean(currentInboxRepo?.autoPublishEnabled) &&
    piStatus.configured &&
    !generating
  const processCurrentInboxReason = getProcessCurrentInboxReason({
    repo: currentInboxRepo,
    piStatus,
    generating
  })
  const detailEmptyDescription = getDetailEmptyDescription({
    currentInboxMessage,
    selectionCount
  })

  const handleInboxEscape = useCallback(
    (e: KeyboardEvent): void => {
      if (
        !shouldClearSelectionForContextualEscape({
          selectionCount: selectedIds.size,
          target: e.target,
          transientUiOpen: hasOpenTransientUi()
        })
      ) {
        return
      }
      e.preventDefault()
      clearSelection()
    },
    [clearSelection, selectedIds.size]
  )

  usePilogHotkey(SHORTCUT_CONTRACT.contextualEscape, (e) => handleInboxEscape(e), {
    enabled: selectedIds.size > 0
  })

  const handleListNavigation = useCallback(
    (event: KeyboardEvent, direction: ListNavigationDirection): void => {
      if (!shouldHandleListNavigationShortcut(event)) return

      const selectedIndexes = notes
        .map((note, index) => (selectedIds.has(note.id) ? index : -1))
        .filter((index) => index >= 0)
      const currentIndex = getSelectedListNavigationIndex({ selectedIndexes, direction })
      const nextIndex = getListNavigationIndex({
        currentIndex,
        itemCount: notes.length,
        direction
      })
      const nextNote = notes[nextIndex]
      if (!nextNote) return

      event.preventDefault()
      setSelectedIds(new Set([nextNote.id]))
      lastClickedIndex.current = nextIndex
    },
    [notes, selectedIds]
  )

  usePilogHotkey(SHORTCUT_CONTRACT.listNext, (event) => handleListNavigation(event, 'next'), {
    enabled: notes.length > 0
  })
  usePilogHotkey(
    SHORTCUT_CONTRACT.listPrevious,
    (event) => handleListNavigation(event, 'previous'),
    {
      enabled: notes.length > 0
    }
  )

  const emptyMessage = useMemo(() => {
    const filtered = Boolean(statusFilter || repoFilter !== undefined)
    return filtered
      ? 'No notes match the current filters.'
      : 'No notes yet. Capture a thought from the footer below.'
  }, [statusFilter, repoFilter])

  const updateRunDraftSettings = (next: RepoDraftSettings): void => {
    if (!draftSettingsRepoId) return
    setDraftSettingsOverrideState({
      repoId: draftSettingsRepoId,
      settings: normalizeRepoDraftSettings(next)
    })
    setDraftSettingsMessageState(null)
  }

  const handleSaveRunDraftSettingsAsDefault = async (): Promise<void> => {
    if (!draftSettingsRepo || !activeDraftSettings || !hasDraftSettingsOverride) return
    const repoId = draftSettingsRepo.id
    setSavingDraftSettingsDefault(true)
    setDraftSettingsMessageState(null)
    const request: UpdateRepoDraftSettingsRequest = {
      id: repoId,
      ...activeDraftSettings
    }
    try {
      const updated = await window.pilog.invoke('repos:updateDraftSettings', request)
      if (!updated) {
        setDraftSettingsMessageState({ repoId, message: 'Could not save repo defaults.' })
        return
      }
      setRepos((current) => current.map((repo) => (repo.id === updated.id ? updated : repo)))
      setDraftSettingsOverrideState(null)
      setDraftSettingsMessageState({ repoId, message: 'Saved as repo default.' })
    } catch {
      setDraftSettingsMessageState({ repoId, message: 'Could not save repo defaults.' })
    } finally {
      setSavingDraftSettingsDefault(false)
    }
  }

  const handleGenerateDrafts = async (mode: GenerateDraftsMode): Promise<void> => {
    if (!canGenerateDrafts) return
    if (mode === 'auto-publish-preview' && !canGenerateAndPublish) return
    const selectedNoteSnapshot = [...selectedNotes]
    const selectedIdSnapshot = Array.from(selectedIds)
    const draftSettingsSnapshot = selectedRepo
      ? getDraftSettingsForRun(selectedRepo, draftSettingsOverride)
      : undefined
    setGenerating(true)
    setGenerationError(null)
    try {
      await window.pilog.runAgent(
        { noteIds: selectedIdSnapshot, mode, draftSettingsOverride: draftSettingsSnapshot },
        async (event) => {
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
                undoing: false,
                publishError: null
              })
            } else {
              await completeOnboardingIfNeeded()
              clearSelection()
              onNavigateToDraftReview()
            }
          }
          if (event.type === 'error') {
            if (!mountedRef.current) return
            setGenerationError(
              getGenerationErrorState({ message: event.message, cause: event.cause })
            )
          }
        }
      )
    } catch (error) {
      if (mountedRef.current) {
        const message = getErrorMessage(error, String(error))
        setGenerationError(getGenerationErrorState({ message }))
      }
    } finally {
      if (mountedRef.current) {
        setGenerating(false)
        window.pilog.invoke('pi:status').then(setPiStatus)
      }
    }
  }

  usePilogHotkeySequence(
    SHORTCUT_CONTRACT.generateDrafts,
    () => void handleGenerateDrafts('review'),
    {
      enabled: shouldEnableGenerateDraftsShortcut({ canGenerateDrafts })
    }
  )

  const handleGenerateFirstDraft = async (): Promise<void> => {
    const firstReadyNote =
      onboardingNotes.find((note) => note.status === 'unprocessed' && note.repoId) ??
      (await window.pilog.invoke('note:list')).find(
        (note) => note.status === 'unprocessed' && note.repoId
      )
    if (!firstReadyNote || !piStatus.configured || generating) return

    setOnboardingWorking(true)
    setGenerating(true)
    setOnboardingGenerationPhase('preparing')
    setOnboardingGenerationError(null)
    setOnboardingDraftPreview(null)
    try {
      await window.pilog.runAgent(
        { noteIds: [firstReadyNote.id], mode: 'review' },
        async (event) => {
          if (event.type === 'progress') {
            if (!mountedRef.current) return
            setOnboardingGenerationPhase(event.phase)
          }
          if (event.type === 'final') {
            if (!mountedRef.current) return
            const firstDraft = event.drafts[0]
            if (firstDraft) {
              setOnboardingDraftPreview(generatedDraftToOnboardingPreview(firstDraft))
            }
            await Promise.all([
              fetchNotes(),
              fetchStatusCounts(),
              fetchDraftLinks(),
              fetchOnboardingNotes()
            ])
          }
          if (event.type === 'error') {
            if (!mountedRef.current) return
            setOnboardingGenerationError(event.message)
          }
        }
      )
    } catch (error) {
      if (mountedRef.current) {
        setOnboardingGenerationError(getErrorMessage(error, String(error)))
      }
    } finally {
      if (mountedRef.current) {
        setGenerating(false)
        setOnboardingWorking(false)
        setOnboardingGenerationPhase(null)
        window.pilog.invoke('pi:status').then(setPiStatus)
      }
    }
  }

  const handleOpenOnboardingDrafts = useCallback(async (): Promise<void> => {
    await completeOnboardingIfNeeded()
    clearSelection()
    onNavigateToDraftReview()
  }, [clearSelection, completeOnboardingIfNeeded, onNavigateToDraftReview])

  const handleProcessCurrentInbox = async (): Promise<void> => {
    if (!currentInboxRepo || !canProcessCurrentInbox) return
    const draftSettingsSnapshot = getDraftSettingsForRun(currentInboxRepo, draftSettingsOverride)
    setCurrentInboxMessage(null)
    setGenerationError(null)
    const sourceNoteSnapshot = await window.pilog.invoke('note:list', {
      repoId: currentInboxRepo.id,
      status: 'unprocessed'
    })
    setGenerating(true)
    try {
      const start = await window.pilog.runCurrentInboxAgent(
        {
          repoId: currentInboxRepo.id,
          mode: 'auto-publish-preview',
          draftSettingsOverride: draftSettingsSnapshot
        },
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
                undoing: false,
                publishError: null
              })
            }
          }
          if (event.type === 'error') {
            if (!mountedRef.current) return
            setGenerationError(
              getGenerationErrorState({ message: event.message, cause: event.cause })
            )
          }
        }
      )
      if ('skipped' in start && mountedRef.current) {
        setCurrentInboxMessage(start.reason)
        await Promise.all([fetchNotes(), fetchStatusCounts(), fetchDraftLinks()])
      }
    } catch (error) {
      if (mountedRef.current) {
        const message = getErrorMessage(error, String(error))
        setGenerationError(getGenerationErrorState({ message }))
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
      const recovery = getPublishRecoveryState(error)
      setAutoPublishPreview((prev) => ({
        ...prev,
        publishing: false,
        publishError: recovery.description
      }))
    }
  }

  const handleUndoAutoPublish = async (): Promise<void> => {
    const report = autoPublishPreview.report
    if (!report || autoPublishPreview.undoing || report.successes.length === 0) return
    const issuesToUndo = report.undo?.failureCount ? report.undo.failures : report.successes

    setAutoPublishPreview((prev) => ({ ...prev, undoing: true, publishError: null }))
    try {
      const undo = await window.pilog.invoke('issue-drafts:undoAutoPublishRun', {
        runId: report.runId,
        repoId: report.repoId,
        issues: issuesToUndo
      })
      if (!mountedRef.current) return
      setAutoPublishPreview((prev) => ({
        ...prev,
        report: prev.report ? { ...prev.report, undo } : prev.report,
        undoing: false,
        publishError: null
      }))
    } catch (error) {
      if (!mountedRef.current) return
      const recovery = getPublishRecoveryState(error)
      setAutoPublishPreview((prev) => ({
        ...prev,
        undoing: false,
        publishError: recovery.description
      }))
    }
  }

  return (
    <div className="flex h-full bg-background text-foreground">
      {shouldShowOnboarding ? (
        <OnboardingPanel
          key={onboardingStep}
          state={onboardingState}
          step={onboardingStep}
          signals={onboardingSignals}
          working={onboardingWorking || generating}
          hotkey={onboardingHotkey}
          hotkeyDraft={onboardingHotkeyEdited ? onboardingHotkeyDraft : (onboardingHotkey ?? '')}
          hotkeyDirty={onboardingHotkeyEdited && onboardingHotkeyDraft !== (onboardingHotkey ?? '')}
          noteDraft={onboardingNoteDraft}
          generationPhase={onboardingGenerationPhase}
          generationError={onboardingGenerationError}
          draftPreview={onboardingDraftPreview}
          repo={repos[0] ?? null}
          pi={onboardingPi}
          onConfirmHotkey={handleConfirmHotkey}
          onHotkeyChange={handleOnboardingHotkeyChange}
          onSaveHotkey={() => void handleSaveOnboardingHotkey()}
          onConnectGitHub={() => void handleConnectGitHub()}
          onRepoLinked={handleOnboardingRepoLinked}
          onPiConfigured={handleOnboardingPiConfigured}
          onGitHubRequired={handleOnboardingGitHubRequired}
          onNoteDraftChange={setOnboardingNoteDraft}
          onCreateFirstNote={handleCreateFirstNote}
          onGenerateFirstDraft={handleGenerateFirstDraft}
          onOpenDrafts={handleOpenOnboardingDrafts}
          onSkip={handleSkipOnboarding}
        />
      ) : (
        <>
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
                  {loadingNotes ? (
                    <div className="flex flex-col gap-1" aria-label="Loading inbox notes">
                      <Skeleton className="h-[76px] rounded-md" />
                      <Skeleton className="h-[76px] rounded-md" />
                      <Skeleton className="h-[76px] rounded-md" />
                    </div>
                  ) : notesError ? (
                    <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
                      <EmptyDescription>
                        Inbox notes could not be read. Try loading them again.
                      </EmptyDescription>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchNotes()}
                      >
                        Try again
                      </Button>
                      <p className="line-clamp-3 font-mono text-xs text-muted-foreground">
                        {notesError}
                      </p>
                    </Empty>
                  ) : notes.length === 0 ? (
                    <Empty className="mt-12 border-none bg-transparent p-8 shadow-none">
                      <EmptyDescription>{emptyMessage}</EmptyDescription>
                    </Empty>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {notes.map((note, index) => {
                        const isSelected = selectedIds.has(note.id)
                        const trimmedContent = note.content.trim()
                        const preview = trimmedContent || 'Untitled note'
                        const repo = note.repoId ? reposById.get(note.repoId) : undefined
                        const repoLabel = repo ? `${repo.owner}/${repo.name}` : 'Unassigned'
                        const draftLinks = draftLinksByNote.get(note.id) ?? []
                        const primaryDraftLink = draftLinks[0] ?? null
                        const runId = note.runId
                        const hasGenerationLinks = primaryDraftLink !== null || runId !== null
                        return (
                          <li key={note.id}>
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                <button
                                  type="button"
                                  data-testid="note-row"
                                  onClick={(e) => handleNoteClick(note.id, index, e)}
                                  onContextMenu={() => focusNote(note.id, index)}
                                  className={cn(
                                    'flex min-w-0 max-w-full w-full cursor-pointer items-start gap-3 overflow-hidden rounded-md border px-3 py-2.5 text-left select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30',
                                    'transition-all duration-150 ease-[var(--ease-out-quart)] motion-reduce:transition-colors motion-reduce:duration-0',
                                    isSelected
                                      ? 'border-border bg-muted translate-x-0.5'
                                      : 'border-transparent hover:bg-muted/60'
                                  )}
                                >
                                  <span className="min-w-0 flex flex-1 flex-col gap-1">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="block truncate text-sm leading-snug">
                                          {preview}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent className={INBOX_NOTE_PREVIEW_TOOLTIP_CLASS}>
                                        {preview}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="block truncate font-mono text-xs text-muted-foreground/80">
                                          {repoLabel}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>{repoLabel}</TooltipContent>
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
                              </ContextMenuTrigger>
                              <ContextMenuContent alignOffset={-4}>
                                <ContextMenuGroup>
                                  <ContextMenuItem onSelect={() => focusNote(note.id, index)}>
                                    Open note
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    disabled={!trimmedContent}
                                    onSelect={() => void handleCopyNoteContent(note)}
                                  >
                                    Copy note text
                                  </ContextMenuItem>
                                </ContextMenuGroup>
                                {hasGenerationLinks ? <ContextMenuSeparator /> : null}
                                {primaryDraftLink ? (
                                  <ContextMenuItem
                                    onSelect={() => onNavigateToDraftReview(primaryDraftLink.id)}
                                  >
                                    {draftLinks.length > 1 ? 'View drafts' : 'View draft'}
                                  </ContextMenuItem>
                                ) : null}
                                {runId ? (
                                  <ContextMenuItem
                                    onSelect={() =>
                                      onNavigateToAgentRuns(runId, {
                                        kind: 'note',
                                        noteId: note.id
                                      })
                                    }
                                  >
                                    View run
                                  </ContextMenuItem>
                                ) : null}
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  variant="destructive"
                                  onSelect={() => setPendingDeleteNote(note)}
                                >
                                  Delete note...
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </ScrollArea>
            </main>

            {generationError ? (
              <div className="shrink-0 border-t px-3 py-3">
                <Alert variant="destructive" className="rounded-md">
                  <AlertTitle>{generationError.title}</AlertTitle>
                  <AlertDescription className="flex flex-col gap-2">
                    <span>{generationError.description}</span>
                    <span className="line-clamp-2 font-mono text-xs">
                      {generationError.message}
                    </span>
                    {generationError.actionLabel ? (
                      <span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (generationError.intent === 'settings') onNavigateToSettings()
                            if (generationError.intent === 'repositories')
                              onNavigateToRepositories()
                            if (generationError.intent === 'agent-runs') {
                              onNavigateToAgentRuns(undefined, { kind: 'history' })
                            }
                          }}
                        >
                          {generationError.actionLabel}
                        </Button>
                      </span>
                    ) : null}
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}

            {/* (4) Mode footer — capture by default, triage on selection */}
            <footer className="flex min-h-14 shrink-0 items-center border-t bg-background px-6 py-3">
              {hasSelection ? (
                // Triage-mode: draft generation (+ optional publish). Clearing the
                // selection lives on the title strip (the count chip) and on Esc.
                <div className="flex w-full flex-col gap-1.5">
                  {canGenerateAndPublish ? (
                    // Both actions are viable — show them on one line.
                    // Generate and Publish is the primary action for power users who
                    // turned auto-publish on; Generate Drafts drops to a compact
                    // secondary so it is still reachable without stacking.
                    <div className="flex w-full items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1">
                            <Button
                              size="sm"
                              variant="default"
                              disabled={generating}
                              className="w-full justify-center"
                              onClick={() => void handleGenerateDrafts('auto-publish-preview')}
                            >
                              <HugeiconsIcon
                                icon={GithubIcon}
                                data-icon="inline-start"
                                aria-hidden
                              />
                              {generating ? 'Planning' : 'Generate and Publish'}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Generate drafts, then review planned GitHub writes
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={generating}
                              className="px-2.5"
                              aria-label="Generate drafts only"
                              onClick={() => void handleGenerateDrafts('review')}
                            >
                              <HugeiconsIcon icon={FilePenIcon} className="size-4" aria-hidden />
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>Generate drafts without publishing</TooltipContent>
                      </Tooltip>

                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <button
                            type="button"
                            data-testid="generation-boundary-disclosure"
                            className="inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="Data sharing information"
                          >
                            <HugeiconsIcon
                              icon={InformationCircleIcon}
                              className="size-4"
                              aria-hidden
                            />
                          </button>
                        </HoverCardTrigger>
                        <HoverCardContent side="top" className="w-80 rounded-xl">
                          <div className="space-y-2">
                            <p className="text-sm font-medium">Data sharing</p>
                            <Separator />
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {GENERATION_EGRESS_DISCLOSURE}
                            </p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                  ) : (
                    // Auto-publish is off or prerequisites are missing — show the
                    // single Generate Drafts button exactly as before.
                    <div className="flex w-full items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1">
                            <Button
                              size="sm"
                              variant={canGenerateDrafts ? 'default' : 'outline'}
                              disabled={!canGenerateDrafts}
                              className="w-full justify-center"
                              onClick={() => void handleGenerateDrafts('review')}
                            >
                              <HugeiconsIcon
                                icon={FilePenIcon}
                                data-icon="inline-start"
                                aria-hidden
                              />
                              {generating ? 'Generating' : 'Generate Drafts'}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!canGenerateDrafts && (
                          <TooltipContent>{generateDraftsReason}</TooltipContent>
                        )}
                      </Tooltip>
                      {canGenerateDrafts ? (
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <button
                              type="button"
                              data-testid="generation-boundary-disclosure"
                              className="inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label="Data sharing information"
                            >
                              <HugeiconsIcon
                                icon={InformationCircleIcon}
                                className="size-4"
                                aria-hidden
                              />
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent side="top" className="w-80 rounded-xl">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Data sharing</p>
                              <Separator />
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {GENERATION_EGRESS_DISCLOSURE}
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex w-full flex-col gap-1.5">
                  {currentInboxRepo ? (
                    <div className="flex w-full items-center gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1">
                            <Button
                              size="sm"
                              variant={canProcessCurrentInbox ? 'default' : 'outline'}
                              disabled={!canProcessCurrentInbox}
                              className="w-full justify-center"
                              onClick={() => void handleProcessCurrentInbox()}
                            >
                              <HugeiconsIcon
                                icon={GithubIcon}
                                data-icon="inline-start"
                                aria-hidden
                              />
                              {generating ? 'Planning' : 'Process Current Inbox'}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {!canProcessCurrentInbox && (
                          <TooltipContent>{processCurrentInboxReason}</TooltipContent>
                        )}
                      </Tooltip>
                      {canProcessCurrentInbox ? (
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <button
                              type="button"
                              data-testid="current-inbox-generation-boundary-disclosure"
                              className="inline-flex shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label="Data sharing information"
                            >
                              <HugeiconsIcon
                                icon={InformationCircleIcon}
                                className="size-4"
                                aria-hidden
                              />
                            </button>
                          </HoverCardTrigger>
                          <HoverCardContent side="top" className="w-80 rounded-xl">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Data sharing</p>
                              <Separator />
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                {GENERATION_EGRESS_DISCLOSURE}
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      ) : null}
                    </div>
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
          <section className="flex-1 min-w-0 h-full overflow-hidden">
            {loadingNotes ? (
              <div
                className="flex h-full flex-col gap-4 px-6 py-5"
                aria-label="Loading note detail"
              >
                <Skeleton className="h-8 max-w-xs rounded-md" />
                <Skeleton className="h-[30rem] max-w-[72ch] rounded-md" />
              </div>
            ) : selectedNote ? (
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
                draftSettings={
                  activeDraftSettings && selectedRepo
                    ? {
                        activeSettings: activeDraftSettings,
                        hasOverride: hasDraftSettingsOverride,
                        statusMessage: draftSettingsStatusMessage,
                        repoIndexStatus: getGenerationRepoIndexStatus(selectedRepo),
                        savingDefault: savingDraftSettingsDefault,
                        disabled: generating,
                        onUpdate: updateRunDraftSettings,
                        onSaveAsDefault: handleSaveRunDraftSettingsAsDefault
                      }
                    : undefined
                }
              />
            ) : (
              <Empty className="h-full border-none bg-transparent shadow-none">
                <EmptyDescription className="max-w-[36ch]">
                  {detailEmptyDescription}
                </EmptyDescription>
                {onboardingState && !onboardingState.completed && onboardingState.skipped ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2"
                    onClick={handleResumeOnboarding}
                  >
                    Resume first-run setup
                  </Button>
                ) : null}
              </Empty>
            )}
          </section>
        </>
      )}
      <AutoPublishPreviewDialog
        open={autoPublishPreview.open}
        summary={autoPublishPreview.summary}
        drafts={autoPublishPreview.drafts}
        repo={currentInboxRepo}
        sourceNotes={autoPublishPreview.sourceNotes}
        report={autoPublishPreview.report}
        publishing={autoPublishPreview.publishing}
        undoing={autoPublishPreview.undoing}
        publishError={autoPublishPreview.publishError}
        onOpenChange={(open) => setAutoPublishPreview((prev) => ({ ...prev, open }))}
        onOpenDrafts={() => {
          setAutoPublishPreview((prev) => ({ ...prev, open: false }))
          clearSelection()
          onNavigateToDraftReview()
        }}
        onPublish={() => void handleConfirmAutoPublish()}
        onUndo={() => void handleUndoAutoPublish()}
      />
      <AlertDialog
        open={pendingDeleteNote !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteNote(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this note?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. The note and any draft history derived from it will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteNote) void handleDelete(pendingDeleteNote.id)
                setPendingDeleteNote(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
