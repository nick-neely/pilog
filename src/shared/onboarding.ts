import type { GitHubStatus, Note, PiStatus, Repo } from './ipc'
import type { IssueDraftForReview } from './types'
import { z } from 'zod'

export const ONBOARDING_STEP_ORDER = [
  'hotkey',
  'github',
  'repo',
  'pi',
  'note',
  'draft',
  'review'
] as const

export type OnboardingStepId = (typeof ONBOARDING_STEP_ORDER)[number]

export type OnboardingState = {
  version: 1
  skipped: boolean
  completed: boolean
  confirmedHotkeyAt: string | null
  completedAt: string | null
  skippedAt: string | null
}

export type OnboardingSignals = {
  github: GitHubStatus
  repos: Repo[]
  pi: PiStatus
  notes: Note[]
  drafts: IssueDraftForReview[]
}

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  version: 1,
  skipped: false,
  completed: false,
  confirmedHotkeyAt: null,
  completedAt: null,
  skippedAt: null
}

const OnboardingStateShape = z
  .object({
    skipped: z.boolean().optional(),
    completed: z.boolean().optional(),
    confirmedHotkeyAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
    skippedAt: z.string().nullable().optional()
  })
  .passthrough()

export function normalizeOnboardingState(value: unknown): OnboardingState {
  const parsed = OnboardingStateShape.safeParse(value)
  if (!parsed.success) return DEFAULT_ONBOARDING_STATE

  return {
    version: 1,
    skipped: parsed.data.skipped === true,
    completed: parsed.data.completed === true,
    confirmedHotkeyAt:
      typeof parsed.data.confirmedHotkeyAt === 'string' ? parsed.data.confirmedHotkeyAt : null,
    completedAt: typeof parsed.data.completedAt === 'string' ? parsed.data.completedAt : null,
    skippedAt: typeof parsed.data.skippedAt === 'string' ? parsed.data.skippedAt : null
  }
}

export function parseOnboardingState(raw: string | null): OnboardingState {
  if (!raw) return DEFAULT_ONBOARDING_STATE

  try {
    return normalizeOnboardingState(JSON.parse(raw))
  } catch {
    return DEFAULT_ONBOARDING_STATE
  }
}

export function serializeOnboardingState(state: OnboardingState): string {
  return JSON.stringify(state)
}

export function skipOnboardingState(
  state: OnboardingState,
  now = new Date().toISOString()
): OnboardingState {
  return {
    ...state,
    skipped: true,
    skippedAt: now
  }
}

export function resumeOnboardingState(state: OnboardingState): OnboardingState {
  return {
    ...state,
    skipped: false,
    skippedAt: null
  }
}

export function confirmHotkeyOnboardingState(
  state: OnboardingState,
  now = new Date().toISOString()
): OnboardingState {
  return {
    ...state,
    confirmedHotkeyAt: state.confirmedHotkeyAt ?? now
  }
}

export function completeOnboardingState(
  state: OnboardingState,
  now = new Date().toISOString()
): OnboardingState {
  return {
    ...state,
    skipped: false,
    completed: true,
    completedAt: state.completedAt ?? now,
    skippedAt: null
  }
}

export function shouldOpenMainWindowForOnboarding(state: OnboardingState): boolean {
  return !state.completed && !state.skipped
}

export function getCompletedOnboardingSteps(
  state: OnboardingState,
  signals: OnboardingSignals
): Set<OnboardingStepId> {
  const completed = new Set<OnboardingStepId>()
  if (state.confirmedHotkeyAt) completed.add('hotkey')
  if (signals.github.connected) completed.add('github')
  if (signals.repos.length > 0) completed.add('repo')
  if (signals.pi.configured) completed.add('pi')
  if (signals.notes.length > 0) completed.add('note')
  if (signals.drafts.length > 0) completed.add('draft')
  return completed
}

export function getCurrentOnboardingStep(
  state: OnboardingState,
  signals: OnboardingSignals
): OnboardingStepId | null {
  if (state.completed) return null
  if (!state.confirmedHotkeyAt) return 'hotkey'
  if (!signals.github.connected) return 'github'
  if (signals.repos.length === 0) return 'repo'
  if (!signals.pi.configured) return 'pi'
  if (signals.notes.length === 0) return 'note'
  if (signals.drafts.length === 0) return 'draft'
  return 'review'
}

export function getVisibleOnboardingStep(
  state: OnboardingState | null,
  signals: OnboardingSignals
): OnboardingStepId | null {
  if (!state || state.skipped) return null
  return getCurrentOnboardingStep(state, signals)
}
