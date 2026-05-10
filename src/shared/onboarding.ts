import type { GitHubStatus, Note, PiStatus, Repo } from './ipc'
import type { IssueDraftForReview } from './types'

export type OnboardingStepId = 'hotkey' | 'github' | 'repo' | 'pi' | 'note' | 'draft' | 'review'

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

export function parseOnboardingState(raw: string | null): OnboardingState {
  if (!raw) return DEFAULT_ONBOARDING_STATE

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    return {
      version: 1,
      skipped: parsed.skipped === true,
      completed: parsed.completed === true,
      confirmedHotkeyAt:
        typeof parsed.confirmedHotkeyAt === 'string' ? parsed.confirmedHotkeyAt : null,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : null,
      skippedAt: typeof parsed.skippedAt === 'string' ? parsed.skippedAt : null
    }
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
