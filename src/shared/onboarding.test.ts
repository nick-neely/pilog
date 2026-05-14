import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REPO_DRAFT_SETTINGS,
  type GitHubStatus,
  type Note,
  type PiStatus,
  type Repo
} from './ipc'
import type { IssueDraftForReview } from './types'
import {
  DEFAULT_ONBOARDING_STATE,
  completeOnboardingState,
  confirmHotkeyOnboardingState,
  getCurrentOnboardingStep,
  getVisibleOnboardingStep,
  getCompletedOnboardingSteps,
  parseOnboardingState,
  resumeOnboardingState,
  serializeOnboardingState,
  shouldOpenMainWindowForOnboarding,
  skipOnboardingState,
  type OnboardingSignals,
  type OnboardingState
} from './onboarding'

const note: Note = {
  id: 'note-1',
  content: 'Fix the save button loading state',
  status: 'unprocessed',
  repoId: 'repo-1',
  runId: null,
  captureContext: null,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z'
}

const repo: Repo = {
  id: 'repo-1',
  name: 'pilog',
  owner: 'nick-neely',
  localPath: '/tmp/pilog',
  accessKind: 'host',
  wslDistro: null,
  wslPath: null,
  githubUrl: 'https://github.com/nick-neely/pilog',
  defaultBranch: 'main',
  githubLabels: [],
  githubLabelsSyncedAt: null,
  autoPublishEnabled: false,
  autoPublishMaxIssuesPerRun: 5,
  autoPublishDefaultLabel: 'triaged-by-pilog',
  autoPublishDryRun: false,
  autoPublishRequireConfirmation: true,
  ...DEFAULT_REPO_DRAFT_SETTINGS,
  allowDiffSummaryCapture: false,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z'
}

const draft: IssueDraftForReview = {
  id: 'draft-1',
  repoId: 'repo-1',
  title: 'Fix save loading state',
  body: 'Body',
  labels: ['bug'],
  sourceNoteIds: ['note-1'],
  sourceNotes: [note],
  affectedFiles: [{ path: 'src/save.ts', reason: 'Save flow' }],
  confidence: 'high',
  groupingReason: 'One note describes the loading state.',
  workflowState: 'ready',
  clarificationQuestions: [],
  clarificationHistory: [],
  status: 'draft',
  githubIssueUrl: null,
  createdAt: '2026-05-10T00:00:00.000Z',
  updatedAt: '2026-05-10T00:00:00.000Z'
}

function signals(overrides: Partial<OnboardingSignals> = {}): OnboardingSignals {
  return {
    github: { connected: false } satisfies GitHubStatus,
    repos: [],
    pi: { configured: false, reason: 'missing-provider' } satisfies PiStatus,
    notes: [],
    drafts: [],
    ...overrides
  }
}

describe('onboarding state', () => {
  it('opens the main window on first launch until onboarding is skipped or completed', () => {
    expect(shouldOpenMainWindowForOnboarding(DEFAULT_ONBOARDING_STATE)).toBe(true)
    expect(shouldOpenMainWindowForOnboarding(skipOnboardingState(DEFAULT_ONBOARDING_STATE))).toBe(
      false
    )
    expect(
      shouldOpenMainWindowForOnboarding(completeOnboardingState(DEFAULT_ONBOARDING_STATE))
    ).toBe(false)
  })

  it('resumes at the first incomplete setup step from persisted and local app state', () => {
    const state = confirmHotkeyOnboardingState(DEFAULT_ONBOARDING_STATE)

    expect(getCurrentOnboardingStep(state, signals())).toBe('github')
    expect(getCurrentOnboardingStep(state, signals({ github: { connected: true } }))).toBe('repo')
    expect(
      getCurrentOnboardingStep(
        state,
        signals({ github: { connected: true }, repos: [repo], pi: { configured: true } })
      )
    ).toBe('note')
    expect(
      getCurrentOnboardingStep(
        state,
        signals({
          github: { connected: true },
          repos: [repo],
          pi: { configured: true },
          notes: [note]
        })
      )
    ).toBe('draft')
  })

  it('preserves local setup progress when skipped, then resumes when requested', () => {
    const skipped = skipOnboardingState(confirmHotkeyOnboardingState(DEFAULT_ONBOARDING_STATE))

    expect(skipped.skipped).toBe(true)
    expect(getCurrentOnboardingStep(resumeOnboardingState(skipped), signals())).toBe('github')
  })

  it('persists completion after the first generated draft', () => {
    const state: OnboardingState = confirmHotkeyOnboardingState(DEFAULT_ONBOARDING_STATE)
    const completed = completeOnboardingState(state, '2026-05-10T12:00:00.000Z')
    const roundTripped = parseOnboardingState(serializeOnboardingState(completed))

    expect(roundTripped.completed).toBe(true)
    expect(roundTripped.completedAt).toBe('2026-05-10T12:00:00.000Z')
    expect(
      getCurrentOnboardingStep(
        roundTripped,
        signals({
          github: { connected: true },
          repos: [repo],
          pi: { configured: true },
          notes: [note],
          drafts: [draft]
        })
      )
    ).toBeNull()
  })

  it('only exposes onboarding UI after persisted state says it is needed', () => {
    const completed = completeOnboardingState(DEFAULT_ONBOARDING_STATE)
    const skipped = skipOnboardingState(DEFAULT_ONBOARDING_STATE)

    expect(getVisibleOnboardingStep(null, signals())).toBeNull()
    expect(getVisibleOnboardingStep(completed, signals())).toBeNull()
    expect(getVisibleOnboardingStep(skipped, signals())).toBeNull()
    expect(getVisibleOnboardingStep(DEFAULT_ONBOARDING_STATE, signals())).toBe('hotkey')
  })

  it('reports completed setup steps from persisted and local app state', () => {
    const state = confirmHotkeyOnboardingState(DEFAULT_ONBOARDING_STATE)
    const completed = getCompletedOnboardingSteps(
      state,
      signals({
        github: { connected: true },
        repos: [repo],
        pi: { configured: true },
        notes: [note],
        drafts: [draft]
      })
    )

    expect([...completed]).toEqual(['hotkey', 'github', 'repo', 'pi', 'note', 'draft'])
  })

  it('normalizes malformed persisted state back to the default state', () => {
    expect(parseOnboardingState('true')).toEqual(DEFAULT_ONBOARDING_STATE)
    expect(parseOnboardingState('{')).toEqual(DEFAULT_ONBOARDING_STATE)
  })
})
