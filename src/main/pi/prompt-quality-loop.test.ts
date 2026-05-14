import { describe, expect, it } from 'vitest'
import { runPromptQualityLoop } from './prompt-quality-loop'

describe('prompt quality loop', () => {
  it('evaluates fixture repos through the generation prompt, repo tools, templates, and labels', async () => {
    const report = await runPromptQualityLoop()

    expect(report.passed).toBe(true)
    expect(report.fixtures.map((fixture) => fixture.id)).toEqual([
      'focused-bug',
      'related-note-grouping',
      'broad-feature-refactor',
      'context-aware-drafting',
      'context-aware-regeneration'
    ])

    for (const fixture of report.fixtures) {
      expect(fixture.passed).toBe(true)
      expect(fixture.promptIncludesRepoPath).toBe(true)
      expect(fixture.repoToolCalls).toEqual(
        expect.arrayContaining(['list_dir', 'read_file', 'grep', 'git_status'])
      )
      expect(fixture.templateApplied).toBe(true)
      expect(fixture.failures).toEqual([])
    }

    expect(report.fixturesById['focused-bug']).toMatchObject({
      draftCount: 1,
      sourceNoteGroups: [['focused-bug-note']],
      labels: [['bug', 'frontend']],
      affectedFiles: [['src/ui/SaveButton.tsx']],
      clarificationDraftCount: 0
    })
    expect(report.fixturesById['related-note-grouping']).toMatchObject({
      draftCount: 1,
      sourceNoteGroups: [['settings-spacing-note', 'settings-spinner-note', 'settings-error-note']],
      labels: [['settings', 'ux']],
      affectedFiles: [['src/settings/SettingsPanel.tsx']],
      clarificationDraftCount: 0
    })
    expect(report.fixturesById['broad-feature-refactor']).toMatchObject({
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
      clarificationDraftCount: 1
    })
    expect(report.fixturesById['context-aware-drafting']).toMatchObject({
      draftCount: 1,
      sourceNoteGroups: [['capture-context-note']],
      labels: [['bug', 'frontend', 'regression']],
      affectedFiles: [
        ['src/features/issues/NewIssueDialog.tsx', 'src/features/issues/useIssueDraft.ts']
      ],
      clarificationDraftCount: 0
    })
    expect(report.fixturesById['context-aware-regeneration']).toMatchObject({
      draftCount: 2,
      sourceNoteGroups: [['vague-report-note'], ['vague-report-note']],
      labels: [['needs-info'], ['bug', 'frontend']],
      affectedFiles: [['src/activity/ActivitySummary.tsx'], ['src/activity/ActivitySummary.tsx']],
      clarificationDraftCount: 1
    })
  })
})
