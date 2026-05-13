import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  applyIssueTemplateToDraftBody,
  listIssueTemplates,
  listLocalIssueTemplates,
  resolveDefaultIssueTemplate
} from './issue-templates'
import type { GeneratedIssueDraft } from '@shared/types'
import type { Repo, RepoAccessDescriptor } from '@shared/ipc'
import type { IssueTemplateFileSystem } from './issue-templates'

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

  it('discovers templates from a WSL repository access descriptor', () => {
    const access: RepoAccessDescriptor = {
      kind: 'wsl',
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
      distro: 'Ubuntu',
      linuxPath: '/home/neely/dev/pilog'
    }
    const files = createMockTemplateFileSystem({
      '.github/ISSUE_TEMPLATE/bug.md': [
        '---',
        'name: WSL bug',
        'title: "[WSL Bug]: "',
        '---',
        '',
        '## Summary'
      ].join('\n'),
      '.github/ISSUE_TEMPLATE/feature.yaml': [
        'name: WSL feature',
        'title: "[WSL Feature]: "',
        'body:',
        '  - type: textarea',
        '    attributes:',
        '      label: Context',
        '      description: What should change?'
      ].join('\n'),
      '.github/ISSUE_TEMPLATE/config.yml': 'blank_issues_enabled: false',
      '.github/ISSUE_TEMPLATE.md': '## General WSL issue\n\nDescribe the work.'
    })

    expect(listIssueTemplates(access, { fileSystem: files })).toEqual([
      {
        kind: 'markdown',
        name: 'WSL bug',
        path: '.github/ISSUE_TEMPLATE/bug.md',
        title: '[WSL Bug]: ',
        body: '## Summary'
      },
      {
        kind: 'yaml-form',
        name: 'WSL feature',
        path: '.github/ISSUE_TEMPLATE/feature.yaml',
        title: '[WSL Feature]: ',
        body: ['## Context', '<!-- What should change? -->'].join('\n')
      },
      {
        kind: 'markdown',
        name: 'ISSUE_TEMPLATE',
        path: '.github/ISSUE_TEMPLATE.md',
        title: '',
        body: '## General WSL issue\n\nDescribe the work.'
      }
    ])
  })

  it('accepts a persisted WSL Repo for default template lookup', () => {
    const repo = makeRepoRecord({
      localPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
      accessKind: 'wsl',
      wslDistro: 'Ubuntu',
      wslPath: '/home/neely/dev/pilog'
    })
    const files = createMockTemplateFileSystem({
      '.github/ISSUE_TEMPLATE/default.md': '---\nname: Default WSL\n---\n\n## Summary'
    })

    expect(resolveDefaultIssueTemplate(repo, { fileSystem: files })).toMatchObject({
      kind: 'markdown',
      name: 'Default WSL',
      path: '.github/ISSUE_TEMPLATE/default.md'
    })
  })

  it('reads WSL templates through wsl.exe argument arrays by default', () => {
    const access: RepoAccessDescriptor = {
      kind: 'wsl',
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
      distro: 'Ubuntu',
      linuxPath: '/home/neely/dev/pilog'
    }
    const execFileSync = vi.fn((file: string, args: string[]) => {
      expect(file).toBe('wsl.exe')
      expect(args.slice(0, 5)).toEqual(['-d', 'Ubuntu', '--cd', '/home/neely/dev/pilog', '--'])

      const command = args.slice(5)
      if (command.join('\0') === 'test\0-d\0.') return ''
      if (command.join('\0') === 'test\0-d\0.github/ISSUE_TEMPLATE') return ''
      if (command.join('\0') === 'test\0-f\0.github/ISSUE_TEMPLATE.md') {
        throw Object.assign(new Error('missing'), { status: 1 })
      }
      if (command[0] === 'find') return 'bug.md\nconfig.yml\n'
      if (command.join('\0') === 'cat\0.github/ISSUE_TEMPLATE/bug.md') {
        return '---\nname: WSL bug\n---\n\n## Summary'
      }
      throw new Error(`Unexpected command: ${command.join(' ')}`)
    })

    expect(listIssueTemplates(access, { execFileSync })).toEqual([
      {
        kind: 'markdown',
        name: 'WSL bug',
        path: '.github/ISSUE_TEMPLATE/bug.md',
        title: '',
        body: '## Summary'
      }
    ])
  })

  it('falls back to host-local lookup for host Repo records', () => {
    const repoPath = makeRepo({
      '.github/ISSUE_TEMPLATE/bug.md': '---\nname: Host bug\n---\n\n## Summary'
    })
    const repo = makeRepoRecord({ localPath: repoPath })

    expect(resolveDefaultIssueTemplate(repo)).toMatchObject({
      kind: 'markdown',
      name: 'Host bug',
      path: '.github/ISSUE_TEMPLATE/bug.md'
    })
  })

  it('throws a recoverable WSL template inspection error instead of silently falling back', () => {
    const access: RepoAccessDescriptor = {
      kind: 'wsl',
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\missing',
      distro: 'Ubuntu',
      linuxPath: '/home/neely/missing'
    }
    const fileSystem: IssueTemplateFileSystem = {
      ...createMockTemplateFileSystem({}),
      isDirectory() {
        throw new Error('WSL path is unavailable')
      }
    }

    expect(() => resolveDefaultIssueTemplate(access, { fileSystem })).toThrow(
      /Unable to inspect WSL issue templates for Ubuntu at \/home\/neely\/missing/
    )
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

function createMockTemplateFileSystem(files: Record<string, string>): IssueTemplateFileSystem {
  return {
    isDirectory(relativePath: string): boolean {
      if (relativePath === '.' || relativePath === '') return true
      const prefix = `${normalizeRelativePath(relativePath)}/`
      return Object.keys(files).some((file) => file.startsWith(prefix))
    },
    isFile(relativePath: string): boolean {
      return Object.hasOwn(files, normalizeRelativePath(relativePath))
    },
    readDir(relativePath: string): string[] {
      const prefix = `${normalizeRelativePath(relativePath)}/`
      return Object.keys(files)
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length))
        .filter((file) => !file.includes('/'))
    },
    readFile(relativePath: string): string {
      const content = files[normalizeRelativePath(relativePath)]
      if (content === undefined) throw new Error(`Missing ${relativePath}`)
      return content
    }
  }
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, '/')
}

function makeRepoRecord(overrides: Partial<Repo>): Repo {
  return {
    id: 'repo-1',
    name: 'pilog',
    owner: 'nick-neely',
    localPath: '/workspace/pilog',
    accessKind: 'host',
    wslDistro: null,
    wslPath: null,
    githubUrl: 'https://github.com/nick-neely/pilog',
    defaultBranch: 'main',
    githubLabels: [],
    githubLabelsSyncedAt: null,
    autoPublishEnabled: false,
    autoPublishMaxIssuesPerRun: 5,
    autoPublishDefaultLabel: 'triaged-by-pilog',
    autoPublishDryRun: false,
    autoPublishRequireConfirmation: true,
    createdAt: '2026-05-13T00:00:00.000Z',
    updatedAt: '2026-05-13T00:00:00.000Z',
    ...overrides
  }
}
