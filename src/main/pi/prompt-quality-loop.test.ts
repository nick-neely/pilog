import { describe, expect, it } from 'vitest'
import { promptQualityFixtures } from './prompt-quality-fixtures'
import { runPromptQualityLoop } from './prompt-quality-loop'

describe('prompt quality loop', () => {
  it('evaluates fixture repos through the generation prompt, repo tools, templates, and labels', async () => {
    const report = await runPromptQualityLoop()

    expect(report.passed).toBe(true)
    expect(report.fixtures.map((fixture) => fixture.id)).toEqual(
      promptQualityFixtures.map((fixture) => fixture.id)
    )

    for (const fixture of report.fixtures) {
      expect(fixture.passed).toBe(true)
      expect(fixture.promptIncludesRepoPath).toBe(true)
      expect(fixture.repoToolCalls).toEqual(
        expect.arrayContaining(['list_dir', 'read_file', 'grep', 'git_status'])
      )
      expect(fixture.templateApplied).toBe(true)
      expect(fixture.failures).toEqual([])
    }

    for (const fixture of promptQualityFixtures) {
      expect(report.fixturesById[fixture.id]).toMatchObject({
        draftCount: fixture.expected.draftCount,
        sourceNoteGroups: fixture.expected.sourceNoteGroups,
        labels: fixture.expected.labels,
        affectedFiles: fixture.expected.affectedFiles,
        clarificationDraftCount: fixture.expected.clarificationDraftCount
      })
    }
  })
})
