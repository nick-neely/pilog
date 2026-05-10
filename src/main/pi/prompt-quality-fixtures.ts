import type { GeneratedIssueDraft } from '@shared/types'
import type { RepoLabelLike } from '@shared/labels'

export type PromptQualityFixture = {
  id: 'focused-bug' | 'related-note-grouping' | 'broad-feature-refactor'
  title: string
  notes: Array<{ id: string; content: string }>
  repoLabels: RepoLabelLike[]
  primaryFile: string
  grepPattern: string
  response: GeneratedIssueDraft[]
  expected: {
    draftCount: number
    sourceNoteGroups: string[][]
    labels: string[][]
    affectedFiles: string[][]
    acceptanceCriteriaIncludes: string[][]
    implementationNotesIncludes?: string[][]
    clarificationDraftCount: number
  }
}

export const promptQualityFixtures: PromptQualityFixture[] = [
  {
    id: 'focused-bug',
    title: 'Focused bug',
    notes: [
      {
        id: 'focused-bug-note',
        content:
          'Save button in the compose footer stays enabled after click, so users can submit twice.'
      }
    ],
    repoLabels: [{ name: 'bug' }, { name: 'frontend' }, { name: 'needs-info' }],
    primaryFile: 'src/ui/SaveButton.tsx',
    grepPattern: 'SaveButton',
    response: [
      {
        title: 'Disable compose save while submission is pending',
        summary: 'Prevent duplicate compose saves by showing pending feedback and disabling save.',
        context:
          'The source note describes a clear compose-footer bug with a likely owner in SaveButton.',
        sourceNoteIds: ['focused-bug-note'],
        suggestedLabels: ['Bug', 'front end'],
        priority: 'medium',
        affectedFiles: [
          {
            path: 'src/ui/SaveButton.tsx',
            reason: 'SaveButton owns the pending state and duplicate-submit guard.'
          }
        ],
        acceptanceCriteria: [
          'Save is disabled while the submit promise is pending.',
          'A pending state is visible without relying on color alone.',
          'Repeated clicks cannot create duplicate submissions.'
        ],
        implementationNotes: ['Cover mouse and keyboard activation while pending.'],
        confidence: 'high',
        groupingReason: 'Single focused bug note with one affected compose control.',
        publishReady: true
      }
    ],
    expected: {
      draftCount: 1,
      sourceNoteGroups: [['focused-bug-note']],
      labels: [['bug', 'frontend']],
      affectedFiles: [['src/ui/SaveButton.tsx']],
      acceptanceCriteriaIncludes: [['Save is disabled while the submit promise is pending.']],
      clarificationDraftCount: 0
    }
  },
  {
    id: 'related-note-grouping',
    title: 'Related note grouping',
    notes: [
      {
        id: 'settings-spacing-note',
        content: 'Settings panel controls wrap awkwardly on narrow windows.'
      },
      {
        id: 'settings-spinner-note',
        content: 'Saving settings needs a spinner or disabled button so I know it is working.'
      },
      {
        id: 'settings-error-note',
        content: 'Settings save errors disappear too fast to read.'
      }
    ],
    repoLabels: [{ name: 'settings' }, { name: 'ux' }, { name: 'bug' }],
    primaryFile: 'src/settings/SettingsPanel.tsx',
    grepPattern: 'SettingsPanel',
    response: [
      {
        title: 'Polish settings panel feedback states',
        summary: 'Group settings spacing, saving feedback, and error handling into one UX pass.',
        context:
          'All three notes point to the settings panel interaction surface and can be reviewed together.',
        sourceNoteIds: ['settings-spacing-note', 'settings-spinner-note', 'settings-error-note'],
        suggestedLabels: ['Settings', 'UX'],
        priority: 'medium',
        affectedFiles: [
          {
            path: 'src/settings/SettingsPanel.tsx',
            reason: 'SettingsPanel owns layout, save feedback, and error messages.'
          }
        ],
        acceptanceCriteria: [
          'Settings controls remain readable at narrow widths.',
          'Saving settings exposes a non-color-only pending state.',
          'Save errors remain visible until the user changes input or retries.'
        ],
        implementationNotes: ['Keep this as one grouped polish issue for the settings surface.'],
        confidence: 'high',
        groupingReason:
          'Grouped related minor UX notes because they affect src/settings/SettingsPanel.tsx.',
        publishReady: true
      }
    ],
    expected: {
      draftCount: 1,
      sourceNoteGroups: [['settings-spacing-note', 'settings-spinner-note', 'settings-error-note']],
      labels: [['settings', 'ux']],
      affectedFiles: [['src/settings/SettingsPanel.tsx']],
      acceptanceCriteriaIncludes: [['Saving settings exposes a non-color-only pending state.']],
      clarificationDraftCount: 0
    }
  },
  {
    id: 'broad-feature-refactor',
    title: 'Broad feature/refactor split',
    notes: [
      {
        id: 'auth-note',
        content: 'Expired sessions bounce between login and dashboard after token refresh fails.'
      },
      {
        id: 'billing-note',
        content: 'Checkout succeeds but webhook reconciliation leaves subscription status stale.'
      },
      {
        id: 'dashboard-vague-note',
        content: 'Dashboard first screen feels wrong after onboarding.'
      }
    ],
    repoLabels: [{ name: 'auth' }, { name: 'billing' }, { name: 'needs-info' }],
    primaryFile: 'src/auth/session.ts',
    grepPattern: 'refreshSession',
    response: [
      {
        title: 'Coordinate account lifecycle hardening',
        summary:
          'Track auth recovery and billing reconciliation as one parent issue with implementation subtasks.',
        context:
          'The broad notes cross auth and billing account lifecycle areas, so this draft keeps the work coordinated while preserving concrete subtasks.',
        sourceNoteIds: ['auth-note', 'billing-note'],
        suggestedLabels: ['Auth', 'Billing'],
        priority: 'high',
        affectedFiles: [
          {
            path: 'src/auth/session.ts',
            reason: 'Session refresh failures are handled here.'
          },
          {
            path: 'src/auth/middleware.ts',
            reason: 'Middleware owns login/dashboard redirects.'
          },
          {
            path: 'src/billing/checkout.ts',
            reason: 'Checkout success starts the subscription state transition.'
          },
          {
            path: 'src/billing/webhooks.ts',
            reason: 'Webhook reconciliation should finalize subscription status.'
          }
        ],
        acceptanceCriteria: [
          'Failed token refresh sends the user to login once.',
          'Users do not bounce between login and dashboard after an expired session.',
          'Checkout success records a pending subscription state.',
          'Webhook reconciliation updates subscription status idempotently.'
        ],
        implementationNotes: [
          '- [ ] Stabilize expired-session recovery across session refresh and middleware redirects.',
          '- [ ] Reconcile subscription status after checkout webhooks.',
          '- [ ] Add regression coverage for auth recovery and billing reconciliation.'
        ],
        confidence: 'medium',
        groupingReason:
          'Proposed parent-with-subtasks because the work crosses auth recovery and billing reconciliation.',
        publishReady: true
      },
      {
        title: 'Clarify dashboard first-screen concern',
        summary: 'The dashboard note is too vague to turn into implementation-ready work.',
        context:
          'The source note does not name the exact dashboard behavior, component, or expected result.',
        sourceNoteIds: ['dashboard-vague-note'],
        suggestedLabels: ['Needs Info'],
        priority: 'low',
        affectedFiles: [
          {
            path: 'src/dashboard/Home.tsx',
            reason: 'Likely dashboard entry point, but the exact surface needs clarification.'
          }
        ],
        acceptanceCriteria: [
          'A clarified note identifies the dashboard surface and expected behavior.'
        ],
        implementationNotes: ['Ask what feels wrong and how to reproduce it.'],
        confidence: 'low',
        groupingReason: 'Kept vague dashboard note separate because it needs clarification.',
        publishReady: false,
        needsClarification: [
          'Which dashboard screen or component is affected?',
          'What behavior should change after onboarding?'
        ]
      }
    ],
    expected: {
      draftCount: 2,
      sourceNoteGroups: [['auth-note', 'billing-note'], ['dashboard-vague-note']],
      labels: [['auth', 'billing'], ['needs-info']],
      affectedFiles: [
        [
          'src/auth/session.ts',
          'src/auth/middleware.ts',
          'src/billing/checkout.ts',
          'src/billing/webhooks.ts'
        ],
        ['src/dashboard/Home.tsx']
      ],
      acceptanceCriteriaIncludes: [
        ['Users do not bounce between login and dashboard after an expired session.'],
        ['A clarified note identifies the dashboard surface and expected behavior.']
      ],
      implementationNotesIncludes: [
        [
          '- [ ] Stabilize expired-session recovery across session refresh and middleware redirects.'
        ],
        []
      ],
      clarificationDraftCount: 1
    }
  }
]
