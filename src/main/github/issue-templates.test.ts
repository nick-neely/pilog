import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  applyIssueTemplateToDraftBody,
  listLocalIssueTemplates,
  resolveDefaultIssueTemplate
} from './issue-templates'
import type { GeneratedIssueDraft } from '@shared/types'

const draft: GeneratedIssueDraft = {
  title: 'Fix save loading state',
  summary: 'The save button does not show progress while pending.',
  context: 'A source note reported that save can be clicked twice while the request is pending.',
  sourceNoteIds: ['note-1'],
  suggestedLabels: ['bug'],
  affectedFiles: [{ path: 'src/save.tsx', reason: 'Owns the save button state.' }],
  acceptanceCriteria: ['Save shows progress while pending.', 'Save cannot be submitted twice.'],
  implementationNotes: ['Keep keyboard submission disabled while pending.'],
  confidence: 'medium',
  groupingReason: 'Single save-flow note with a clear UI state gap.',
  publishReady: true
}

describe('local GitHub issue templates', () => {
  it('discovers markdown, YAML issue-form, and single-file issue templates', () => {
    const repoPath = makeRepo({
      '.github/ISSUE_TEMPLATE/bug.md': [
        '---',
        'name: Bug report',
        'title: "[Bug]: "',
        'labels: bug',
        '---',
        '',
        '## What happened?',
        '',
        '## Steps to reproduce'
      ].join('\n'),
      '.github/ISSUE_TEMPLATE/feature.yml': [
        'name: Feature request',
        'description: Suggest a product improvement',
        'title: "[Feature]: "',
        'body:',
        '  - type: textarea',
        '    id: problem',
        '    attributes:',
        '      label: Problem',
        '      description: What should change?',
        '      placeholder: Describe the gap',
        '    validations:',
        '      required: true',
        '  - type: checkboxes',
        '    id: terms',
        '    attributes:',
        '      label: Terms',
        '      options:',
        '        - label: I checked existing issues'
      ].join('\n'),
      '.github/ISSUE_TEMPLATE/config.yml': 'blank_issues_enabled: false',
      '.github/ISSUE_TEMPLATE.md': '## General issue\n\nDescribe the work.'
    })

    expect(listLocalIssueTemplates(repoPath)).toEqual([
      {
        kind: 'markdown',
        name: 'Bug report',
        path: '.github/ISSUE_TEMPLATE/bug.md',
        title: '[Bug]: ',
        body: '## What happened?\n\n## Steps to reproduce'
      },
      {
        kind: 'yaml-form',
        name: 'Feature request',
        path: '.github/ISSUE_TEMPLATE/feature.yml',
        title: '[Feature]: ',
        body: [
          '## Problem',
          '<!-- What should change? -->',
          '<!-- Describe the gap -->',
          '',
          '## Terms',
          '- [ ] I checked existing issues'
        ].join('\n')
      },
      {
        kind: 'markdown',
        name: 'ISSUE_TEMPLATE',
        path: '.github/ISSUE_TEMPLATE.md',
        title: '',
        body: '## General issue\n\nDescribe the work.'
      }
    ])
  })

  it('returns null for repositories without templates', () => {
    expect(resolveDefaultIssueTemplate(makeRepo({}))).toBeNull()
  })

  it('uses the default repo template as generated draft scaffolding while preserving Pilog review details', () => {
    const template = {
      kind: 'markdown' as const,
      name: 'Bug report',
      path: '.github/ISSUE_TEMPLATE/bug.md',
      title: '',
      body: ['## Summary', '', '## Acceptance Criteria', '', '## Additional context'].join('\n')
    }

    const body = applyIssueTemplateToDraftBody(draft, template)

    expect(body).toContain('## Summary\nThe save button does not show progress while pending.')
    expect(body).toContain(
      '## Acceptance Criteria\n- Save shows progress while pending.\n- Save cannot be submitted twice.'
    )
    expect(body).toContain('## Additional context')
    expect(body).toContain('## Pilog Review Notes')
    expect(body).toContain('- Confidence: medium')
    expect(body).toContain('- Grouping reason: Single save-flow note with a clear UI state gap.')
    expect(body).toContain('### Affected Files\n- `src/save.tsx`: Owns the save button state.')
  })
})

function makeRepo(files: Record<string, string>): string {
  const repoPath = mkdtempSync(path.join(tmpdir(), 'pilog-templates-'))

  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(repoPath, relativePath)
    mkdirSync(path.dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content)
  }

  return repoPath
}
