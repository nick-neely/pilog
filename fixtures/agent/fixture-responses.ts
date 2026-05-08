import type { GeneratedIssueDraft } from '../../src/shared/types'

export const threeDraftResponse: GeneratedIssueDraft[] = [
  {
    title: 'Polish settings form feedback',
    summary: 'Improve mobile spacing, save feedback, and avatar upload errors in settings.',
    context: 'The notes point at the settings form surface and its save/avatar controls.',
    sourceNoteIds: ['note-settings-spacing', 'note-settings-loading', 'note-avatar-error'],
    suggestedLabels: ['ux', 'settings'],
    priority: 'medium',
    affectedFiles: [
      {
        path: 'src/settings/SettingsForm.tsx',
        reason: 'SettingsForm owns the settings save controls and avatar upload surface.'
      }
    ],
    acceptanceCriteria: [
      'Settings controls remain readable at mobile widths.',
      'The save button exposes a loading state while saving.',
      'Avatar upload failures show an actionable error message.'
    ],
    implementationNotes: ['Review SettingsForm layout and save/avatar error states together.'],
    confidence: 'high',
    groupingReason:
      'Grouped three minor UX notes because they all affect src/settings/SettingsForm.tsx.',
    publishReady: true
  },
  {
    title: 'Stabilize expired-session handling',
    summary: 'Fix expired-session redirects and review token refresh/session persistence.',
    context: 'The note crosses auth middleware, token refresh, and session storage.',
    sourceNoteIds: ['note-auth-session'],
    suggestedLabels: ['auth'],
    priority: 'high',
    affectedFiles: [
      {
        path: 'src/auth/middleware.ts',
        reason: 'Middleware owns expired-session redirects.'
      },
      {
        path: 'src/auth/session.ts',
        reason: 'Session refresh logic is likely involved.'
      },
      {
        path: 'src/db/session-store.ts',
        reason: 'Session persistence may need cleanup.'
      }
    ],
    acceptanceCriteria: [
      'Expired sessions redirect consistently to login.',
      'Token refresh failures are handled without loops.',
      'Session persistence cleanup is covered by tests.'
    ],
    implementationNotes: [
      'Use a parent issue with checklist subtasks for middleware, refresh, and persistence.'
    ],
    confidence: 'medium',
    groupingReason:
      'Proposed parent-with-subtasks because the note crosses auth middleware, refresh, and database session storage.',
    publishReady: true
  },
  {
    title: 'Clarify dashboard issue',
    summary: 'The dashboard note is too vague to turn into implementation-ready work.',
    context: 'The note does not identify a concrete component, behavior, or expected outcome.',
    sourceNoteIds: ['note-vague'],
    suggestedLabels: ['needs-info'],
    priority: 'low',
    affectedFiles: [
      {
        path: 'src/settings/SettingsForm.tsx',
        reason:
          'Placeholder affected file from fixture repo; actual dashboard surface needs clarification.'
      }
    ],
    acceptanceCriteria: ['A clearer note names the dashboard surface and expected behavior.'],
    implementationNotes: ['Ask for the exact dashboard screen and observed behavior.'],
    confidence: 'low',
    groupingReason: 'Kept vague dashboard note separate because it needs clarification.',
    publishReady: false,
    needsClarification: ['Which dashboard screen or component is affected?', 'What looks wrong?']
  }
]

export const singleDraftResponse: GeneratedIssueDraft[] = [threeDraftResponse[0]!]

export const clarificationResponse: GeneratedIssueDraft[] = [threeDraftResponse[2]!]
