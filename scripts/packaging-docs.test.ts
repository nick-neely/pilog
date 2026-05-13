import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('packaging and release workflow documentation', () => {
  it('documents the performance and size workflow program for maintainers', async () => {
    const packaging = await readFile('docs/packaging.md', 'utf8')
    const release = await readFile('docs/release.md', 'utf8')
    const checklist = await readFile('docs/release-checklist.md', 'utf8')

    expect(packaging).toContain('PRD #65')
    for (const issueReference of ['#66', '#67', '#68', '#69', '#70', '#71', '#73', '#74']) {
      expect(packaging).toContain(issueReference)
    }

    expect(packaging).toContain('## Reading Inventory Reports')
    expect(packaging).toContain('## Local Reports vs Release Enforcement')
    expect(packaging).toContain('## Contributor Packaging Review')
    expect(packaging).toContain('PILOG_ELECTRON_TRACE=1')
    expect(packaging).toContain('--pilog-trace')
    expect(packaging).toContain('Normal user operation')

    expect(release).toContain('packaged-size-reports-stable-<platform>')
    expect(release).toContain('packaged-size-reports-preview-<platform>')
    expect(release).toContain('packaged performance baseline')
    expect(release).toContain('packaged-performance-budget-report.json')
    expect(release).toContain('--enforce-budgets')

    expect(checklist).toContain('packaged-size-reports-')
    expect(checklist).toContain('packaged-performance-baseline.json')
    expect(checklist).toContain('packaged-performance-budget-report.json')
  })
})
