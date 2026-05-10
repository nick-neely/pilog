import { runPromptQualityLoop } from './prompt-quality-loop'

void main()

async function main(): Promise<void> {
  const report = await runPromptQualityLoop()

  for (const fixture of report.fixtures) {
    const status = fixture.passed ? 'PASS' : 'FAIL'
    console.log(`${status} ${fixture.id}: ${fixture.title}`)
    console.log(`  drafts: ${fixture.draftCount}`)
    console.log(
      `  source notes: ${fixture.sourceNoteGroups.map((group) => group.join('+')).join(', ')}`
    )
    console.log(`  labels: ${fixture.labels.map((labels) => labels.join(',')).join(' | ')}`)
    console.log(
      `  affected files: ${fixture.affectedFiles.map((files) => files.join(',')).join(' | ')}`
    )
    console.log(`  clarification drafts: ${fixture.clarificationDraftCount}`)

    for (const failure of fixture.failures) {
      console.log(`  - ${failure}`)
    }
  }

  if (!report.passed) {
    process.exitCode = 1
  }
}
