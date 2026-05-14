import type { GeneratedIssueDraft } from '@shared/types'
import type { ClarificationHistoryEntry, NoteCaptureContext } from '@shared/types'
import type { RepoDraftSettings } from '@shared/ipc'
import type { RepoLabelLike } from '@shared/labels'

export type PromptQualityFixture = {
  id:
    | 'focused-bug'
    | 'related-note-grouping'
    | 'broad-feature-refactor'
    | 'context-aware-drafting'
    | 'context-aware-regeneration'
  title: string
  notes: Array<{ id: string; content: string; captureContext?: NoteCaptureContext | null }>
  repoLabels: RepoLabelLike[]
  draftSettings?: Partial<RepoDraftSettings>
  clarificationHistory?: ClarificationHistoryEntry[]
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
    contextIncludes?: string[][]
    summaryIncludes?: string[][]
    promptIncludes?: string[]
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
  },
  {
    id: 'context-aware-drafting',
    title: 'Context-aware drafting controls',
    notes: [
      {
        id: 'capture-context-note',
        content:
          'The new issue dialog loses the selected repo when I reopen it after a failed save.',
        captureContext: {
          state: 'captured',
          branch: 'fix/new-issue-dialog-repo',
          dirtyFiles: [
            'src/features/issues/NewIssueDialog.tsx',
            'src/features/issues/useIssueDraft.ts'
          ],
          stagedFiles: ['src/features/issues/repository-selection.ts'],
          headSha: 'cafef00d',
          headSubject: 'Preserve repository selection in new issue flow',
          capturedAt: '2026-05-14T22:10:00.000Z'
        }
      }
    ],
    repoLabels: [{ name: 'bug' }, { name: 'frontend' }, { name: 'regression' }],
    draftSettings: {
      issueStyleDepth: 'detailed',
      issueStyleAudience: 'open_source',
      draftContentToggles: {
        includeImplementationNotes: false,
        includeAffectedFiles: true,
        includeSourceNotes: false,
        includeAcceptanceCriteria: true,
        includeConfidenceRationale: false,
        includeReproductionSteps: true
      }
    },
    primaryFile: 'src/features/issues/NewIssueDialog.tsx',
    grepPattern: 'selectedRepoId',
    response: [
      {
        title: 'Preserve selected repository after new issue save failure',
        summary:
          'Keep the selected repository stable when the new issue dialog is reopened after a failed save.',
        context:
          'Capture Context pointed generation at branch fix/new-issue-dialog-repo and the dirty NewIssueDialog/useIssueDraft files, and live inspection confirmed selectedRepoId is owned by NewIssueDialog.',
        sourceNoteIds: ['capture-context-note'],
        suggestedLabels: ['Bug', 'frontend', 'Regression'],
        priority: 'medium',
        affectedFiles: [
          {
            path: 'src/features/issues/NewIssueDialog.tsx',
            reason:
              'Live inspection found selectedRepoId state is reset when the dialog closes after save failure.'
          },
          {
            path: 'src/features/issues/useIssueDraft.ts',
            reason:
              'Live inspection found failed save errors return through the issue draft hook used by the dialog.'
          }
        ],
        acceptanceCriteria: [
          'Reopening the new issue dialog after a failed save keeps the previously selected repository.',
          'The issue can be retried without reselecting the repository.',
          'The regression is covered by a test that exercises the failed-save path.'
        ],
        implementationNotes: [],
        confidence: 'high',
        groupingReason:
          'Single focused bug note; Capture Context narrowed live inspection to the changed issue-dialog files.',
        publishReady: true
      }
    ],
    expected: {
      draftCount: 1,
      sourceNoteGroups: [['capture-context-note']],
      labels: [['bug', 'frontend', 'regression']],
      affectedFiles: [
        ['src/features/issues/NewIssueDialog.tsx', 'src/features/issues/useIssueDraft.ts']
      ],
      acceptanceCriteriaIncludes: [
        [
          'Reopening the new issue dialog after a failed save keeps the previously selected repository.'
        ]
      ],
      implementationNotesIncludes: [[]],
      contextIncludes: [['Capture Context pointed generation at branch fix/new-issue-dialog-repo']],
      promptIncludes: [
        'branch: fix/new-issue-dialog-repo',
        '- src/features/issues/NewIssueDialog.tsx',
        'headSubject: Preserve repository selection in new issue flow',
        'depth: detailed',
        'audience: open_source',
        'includeImplementationNotes: false',
        'includeSourceNotes: false',
        'includeConfidenceRationale: false',
        'includeReproductionSteps: true'
      ],
      clarificationDraftCount: 0
    }
  },
  {
    id: 'context-aware-regeneration',
    title: 'Clarification regeneration',
    notes: [
      {
        id: 'vague-report-note',
        content: 'The activity screen count is wrong after import.',
        captureContext: {
          state: 'captured',
          branch: 'main',
          dirtyFiles: ['src/activity/ActivitySummary.tsx'],
          stagedFiles: [],
          headSha: 'deadc0de',
          headSubject: 'Tighten activity import summary',
          capturedAt: '2026-05-14T22:20:00.000Z'
        }
      }
    ],
    repoLabels: [{ name: 'bug' }, { name: 'needs-info' }, { name: 'frontend' }],
    clarificationHistory: [
      {
        question: 'Which count is wrong?',
        answer: 'The imported item count in the activity summary footer.',
        answeredAt: '2026-05-14T22:35:00.000Z'
      },
      {
        question: 'What should the count include?',
        answer: 'It should count only imported rows that completed successfully.',
        answeredAt: '2026-05-14T22:36:00.000Z'
      }
    ],
    primaryFile: 'src/activity/ActivitySummary.tsx',
    grepPattern: 'successfulImportedRows',
    response: [
      {
        title: 'Clarify activity import count before implementation',
        summary: 'The original activity-screen note was too vague to publish without questions.',
        context:
          'Before answers were available, the note did not identify which activity count was wrong or the expected counting rule.',
        sourceNoteIds: ['vague-report-note'],
        suggestedLabels: ['Needs Info'],
        priority: 'low',
        affectedFiles: [
          {
            path: 'src/activity/ActivitySummary.tsx',
            reason:
              'Likely activity summary surface, but the exact count needed user clarification.'
          }
        ],
        acceptanceCriteria: ['The clarified issue identifies the wrong count and expected rule.'],
        implementationNotes: ['Ask for the count name and expected import-counting behavior.'],
        confidence: 'low',
        groupingReason: 'Kept vague activity note as a clarification draft.',
        publishReady: false,
        needsClarification: ['Which count is wrong?', 'What should the count include?']
      },
      {
        title: 'Count only successful imports in the activity summary footer',
        summary:
          'Use Clarification History to scope the activity footer count to successfully imported rows.',
        context:
          'Clarification History identified the imported item count in the activity summary footer and defined the expected rule as successful imports only.',
        sourceNoteIds: ['vague-report-note'],
        suggestedLabels: ['Bug', 'frontend'],
        priority: 'medium',
        affectedFiles: [
          {
            path: 'src/activity/ActivitySummary.tsx',
            reason:
              'Live inspection found the footer renders successfulImportedRows for the import summary.'
          }
        ],
        acceptanceCriteria: [
          'The activity summary footer counts only rows that completed import successfully.',
          'Failed or skipped import rows are excluded from the displayed imported item count.'
        ],
        implementationNotes: [
          'Use the clarified successful-import rule when deriving the footer count.'
        ],
        confidence: 'high',
        groupingReason:
          'Regenerated from the original note plus Clarification History once the expected counting rule was known.',
        publishReady: true
      }
    ],
    expected: {
      draftCount: 2,
      sourceNoteGroups: [['vague-report-note'], ['vague-report-note']],
      labels: [['needs-info'], ['bug', 'frontend']],
      affectedFiles: [['src/activity/ActivitySummary.tsx'], ['src/activity/ActivitySummary.tsx']],
      acceptanceCriteriaIncludes: [
        ['The clarified issue identifies the wrong count and expected rule.'],
        ['The activity summary footer counts only rows that completed import successfully.']
      ],
      contextIncludes: [
        ['Before answers were available'],
        ['Clarification History identified the imported item count']
      ],
      promptIncludes: [
        'Clarification History:',
        'question: Which count is wrong?',
        'answer: The imported item count in the activity summary footer.',
        'answer: It should count only imported rows that completed successfully.'
      ],
      clarificationDraftCount: 1
    }
  }
]
