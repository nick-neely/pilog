import { runPromptQualityLoop } from './prompt-quality-loop'

void main()

async function main(): Promise<void> {
  const report = await runPromptQualityLoop()

  for (const fixture of report.fixtures) {
    const status = fixture.passed ? 'PASS' : 'FAIL'
    writeLine(`${status} ${fixture.id}: ${fixture.title}`)
    writeLine(`  drafts: ${fixture.draftCount}`)
    writeLine(
      `  source notes: ${fixture.sourceNoteGroups.map((group) => group.join('+')).join(', ')}`
    )
    writeLine(`  labels: ${fixture.labels.map((labels) => labels.join(',')).join(' | ')}`)
    writeLine(
      `  affected files: ${fixture.affectedFiles.map((files) => files.join(',')).join(' | ')}`
    )
    writeLine(`  clarification drafts: ${fixture.clarificationDraftCount}`)

    for (const failure of fixture.failures) {
      writeLine(`  - ${failure}`)
    }
  }

  if (!report.passed) {
    process.exitCode = 1
  }
}

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`)
}
