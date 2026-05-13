import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { GeneratedIssueDraft, GitHubIssueTemplate } from '@shared/types'
import type { Repo, RepoAccessDescriptor } from '@shared/ipc'

type FrontMatter = {
  body: string
  fields: Record<string, string>
}

type DraftSection = {
  heading: string
  content: string
}

export type IssueTemplateFileSystem = {
  isDirectory(relativePath: string): boolean
  isFile(relativePath: string): boolean
  readDir(relativePath: string): string[]
  readFile(relativePath: string): string
}

type IssueTemplateLookupInput = string | Repo | RepoAccessDescriptor

type ExecFileSync = (
  file: string,
  args: string[],
  options?: {
    encoding?: BufferEncoding
    windowsHide?: boolean
    timeout?: number
    maxBuffer?: number
  }
) => string | Buffer

type IssueTemplateLookupDeps = {
  fileSystem?: IssueTemplateFileSystem
  execFileSync?: ExecFileSync
}

const ISSUE_TEMPLATE_DIR = path.join('.github', 'ISSUE_TEMPLATE')
const SINGLE_ISSUE_TEMPLATE = path.join('.github', 'ISSUE_TEMPLATE.md')
const CONFIG_TEMPLATE_NAMES = new Set(['config.yml', 'config.yaml'])
const WSL_TEMPLATE_COMMAND_TIMEOUT_MS = 10000
const WSL_TEMPLATE_COMMAND_MAX_BUFFER = 1024 * 1024

export function listLocalIssueTemplates(repoPath: string): GitHubIssueTemplate[] {
  return listIssueTemplates(repoPath)
}

export function listIssueTemplates(
  input: IssueTemplateLookupInput,
  deps: IssueTemplateLookupDeps = {}
): GitHubIssueTemplate[] {
  const access = resolveIssueTemplateAccess(input)
  const fileSystem = deps.fileSystem ?? createIssueTemplateFileSystem(access, deps.execFileSync)
  const templates: GitHubIssueTemplate[] = []

  try {
    if (access.kind === 'wsl' && !fileSystem.isDirectory('.')) {
      throw new Error('Repository path is not readable from WSL.')
    }

    if (fileSystem.isDirectory(ISSUE_TEMPLATE_DIR)) {
      const templateFiles = fileSystem
        .readDir(ISSUE_TEMPLATE_DIR)
        .filter((file) => isTemplateFile(file) && !CONFIG_TEMPLATE_NAMES.has(file.toLowerCase()))
        .sort((a, b) => a.localeCompare(b))

      for (const file of templateFiles) {
        templates.push(readIssueTemplateFile(fileSystem, file))
      }
    }

    if (fileSystem.isFile(SINGLE_ISSUE_TEMPLATE)) {
      templates.push(
        parseMarkdownIssueTemplate(
          SINGLE_ISSUE_TEMPLATE,
          fileSystem.readFile(SINGLE_ISSUE_TEMPLATE)
        )
      )
    }
  } catch (error) {
    if (access.kind === 'wsl') {
      throw new Error(
        `Unable to inspect WSL issue templates for ${access.distro} at ${access.linuxPath}. ${formatErrorMessage(error)}`
      )
    }
    throw error
  }

  return templates
}

export function resolveDefaultIssueTemplate(
  input: IssueTemplateLookupInput,
  deps: IssueTemplateLookupDeps = {}
): GitHubIssueTemplate | null {
  return listIssueTemplates(input, deps)[0] ?? null
}

export function applyIssueTemplateToDraftBody(
  draft: GeneratedIssueDraft,
  template: GitHubIssueTemplate | null
): string {
  if (!template) return formatFallbackIssueDraftBody(draft)

  const body = fillTemplateSections(template.body, draft)
  return [body.trim(), formatPilogReviewNotes(draft, body)].filter(Boolean).join('\n\n')
}

export function formatFallbackIssueDraftBody(draft: GeneratedIssueDraft): string {
  const lines = [
    draft.summary,
    '',
    '## Context',
    draft.context,
    '',
    '## Acceptance Criteria',
    ...draft.acceptanceCriteria.map((item) => `- ${item}`)
  ]

  if (draft.implementationNotes.length > 0) {
    lines.push(
      '',
      '## Implementation Notes',
      ...draft.implementationNotes.map((item) => `- ${item}`)
    )
  }

  if (draft.needsClarification && draft.needsClarification.length > 0) {
    lines.push('', '## Needs Clarification', ...draft.needsClarification.map((item) => `- ${item}`))
  }

  return lines.join('\n')
}

function isTemplateFile(file: string): boolean {
  return /\.(md|ya?ml)$/i.test(file)
}

function isYamlTemplate(file: string): boolean {
  return /\.ya?ml$/i.test(file)
}

function parseMarkdownIssueTemplate(relativePath: string, content: string): GitHubIssueTemplate {
  const frontMatter = parseFrontMatter(content)
  const basename = path.basename(relativePath, path.extname(relativePath))

  return {
    kind: 'markdown',
    name: frontMatter.fields.name || frontMatter.fields.title || basename,
    path: normalizeTemplatePath(relativePath),
    title: frontMatter.fields.title ?? '',
    body: frontMatter.body.trim()
  }
}

function parseYamlIssueTemplate(relativePath: string, content: string): GitHubIssueTemplate {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const basename = path.basename(relativePath, path.extname(relativePath))

  return {
    kind: 'yaml-form',
    name: readTopLevelValue(lines, 'name') || basename,
    path: normalizeTemplatePath(relativePath),
    title: readTopLevelValue(lines, 'title'),
    body: renderYamlIssueFormBody(lines).trim()
  }
}

function readIssueTemplateFile(
  fileSystem: IssueTemplateFileSystem,
  fileName: string
): GitHubIssueTemplate {
  const relativePath = path.join(ISSUE_TEMPLATE_DIR, fileName)
  const content = fileSystem.readFile(relativePath)

  if (isYamlTemplate(fileName)) {
    return parseYamlIssueTemplate(relativePath, content)
  }

  return parseMarkdownIssueTemplate(relativePath, content)
}

function parseFrontMatter(content: string): FrontMatter {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { body: normalized, fields: {} }

  const end = normalized.indexOf('\n---', 4)
  if (end === -1) return { body: normalized, fields: {} }

  const rawFields = normalized.slice(4, end).split('\n')
  const body = normalized.slice(end + '\n---'.length).replace(/^\n/, '')
  const fields: Record<string, string> = {}

  for (const line of rawFields) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
    if (!match) continue
    fields[match[1]!] = unquoteYamlScalar(match[2] ?? '')
  }

  return { body, fields }
}

function readTopLevelValue(lines: string[], key: string): string {
  const prefix = `${key}:`
  const line = lines.find((item) => item.startsWith(prefix))
  if (!line) return ''
  return unquoteYamlScalar(line.slice(prefix.length).trim())
}

function renderYamlIssueFormBody(lines: string[]): string {
  const rendered: string[] = []
  let currentLabel = ''
  let currentDescription = ''
  let currentPlaceholder = ''
  let currentOptions: string[] = []

  const flush = (): void => {
    if (!currentLabel) return

    if (rendered.length > 0) rendered.push('')
    rendered.push(`## ${currentLabel}`)
    if (currentDescription) rendered.push(`<!-- ${currentDescription} -->`)
    if (currentPlaceholder) rendered.push(`<!-- ${currentPlaceholder} -->`)
    for (const option of currentOptions) rendered.push(`- [ ] ${option}`)

    currentLabel = ''
    currentDescription = ''
    currentPlaceholder = ''
    currentOptions = []
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (line.startsWith('- type:')) {
      flush()
      continue
    }

    if (line.startsWith('label:')) {
      const value = unquoteYamlScalar(line.slice('label:'.length).trim())
      if (currentLabel && currentOptions.length === 0) flush()
      currentLabel = value
      continue
    }

    if (line.startsWith('description:')) {
      currentDescription = unquoteYamlScalar(line.slice('description:'.length).trim())
      continue
    }

    if (line.startsWith('placeholder:')) {
      currentPlaceholder = unquoteYamlScalar(line.slice('placeholder:'.length).trim())
      continue
    }

    if (line.startsWith('- label:')) {
      currentOptions.push(unquoteYamlScalar(line.slice('- label:'.length).trim()))
    }
  }

  flush()
  return rendered.join('\n')
}

function fillTemplateSections(templateBody: string, draft: GeneratedIssueDraft): string {
  let body = templateBody.trim()
  const sections: DraftSection[] = [
    { heading: 'Summary', content: draft.summary },
    { heading: 'Context', content: draft.context },
    { heading: 'Additional context', content: draft.context },
    { heading: 'Acceptance Criteria', content: formatMarkdownList(draft.acceptanceCriteria) },
    { heading: 'Implementation Notes', content: formatMarkdownList(draft.implementationNotes) }
  ]

  if (draft.needsClarification && draft.needsClarification.length > 0) {
    sections.push({
      heading: 'Needs Clarification',
      content: formatMarkdownList(draft.needsClarification)
    })
  }

  for (const section of sections) {
    body = fillSection(body, section.heading, section.content)
  }

  if (!hasHeading(body, 'Summary')) {
    body = [draft.summary, body].filter(Boolean).join('\n\n')
  }

  if (!hasHeading(body, 'Acceptance Criteria')) {
    body = [
      body,
      '## Acceptance Criteria',
      ...formatMarkdownListLines(draft.acceptanceCriteria)
    ].join('\n')
  }

  return body
}

function fillSection(body: string, heading: string, content: string): string {
  if (!content || !hasHeading(body, heading)) return body

  const escapedHeading = escapeRegExp(heading)
  const pattern = new RegExp(
    `(##+[^\\S\\n]+${escapedHeading}[^\\S\\n]*(?:\\n|$))([\\s\\S]*?)(?=\\n##+[^\\S\\n]+|$)`,
    'i'
  )
  return body.replace(pattern, (_match, prefix: string, existing: string) => {
    const trimmedExisting = existing.trim()
    const nextContent = trimmedExisting ? `${content}\n\n${trimmedExisting}` : content
    return `${prefix}${nextContent}\n`
  })
}

function hasHeading(body: string, heading: string): boolean {
  return new RegExp(`^##+[^\\S\\n]+${escapeRegExp(heading)}[^\\S\\n]*$`, 'im').test(body)
}

function formatPilogReviewNotes(draft: GeneratedIssueDraft, templateBody: string): string {
  const lines = [
    '## Pilog Review Notes',
    `- Confidence: ${draft.confidence}`,
    `- Grouping reason: ${draft.groupingReason}`,
    '',
    '### Affected Files',
    ...draft.affectedFiles.map((file) => `- \`${file.path}\`: ${file.reason}`)
  ]

  if (draft.implementationNotes.length > 0 && !hasHeading(templateBody, 'Implementation Notes')) {
    lines.push(
      '',
      '### Implementation Notes',
      ...formatMarkdownListLines(draft.implementationNotes)
    )
  }

  if (draft.needsClarification && draft.needsClarification.length > 0) {
    lines.push('', '### Needs Clarification', ...formatMarkdownListLines(draft.needsClarification))
  }

  return lines.join('\n')
}

function formatMarkdownList(items: string[]): string {
  return formatMarkdownListLines(items).join('\n')
}

function formatMarkdownListLines(items: string[]): string[] {
  return items.map((item) => `- ${item}`)
}

function normalizeTemplatePath(templatePath: string): string {
  return templatePath.split(path.sep).join('/')
}

function resolveIssueTemplateAccess(input: IssueTemplateLookupInput): RepoAccessDescriptor {
  if (typeof input === 'string') return { kind: 'host', displayPath: input }
  if ('kind' in input) return input
  if (input.accessKind === 'wsl' && input.wslDistro && input.wslPath) {
    return {
      kind: 'wsl',
      displayPath: input.localPath,
      distro: input.wslDistro,
      linuxPath: input.wslPath
    }
  }
  return { kind: 'host', displayPath: input.localPath }
}

function createIssueTemplateFileSystem(
  access: RepoAccessDescriptor,
  runExecFileSync?: ExecFileSync
): IssueTemplateFileSystem {
  if (access.kind === 'host') return createHostIssueTemplateFileSystem(access.displayPath)
  return createWslIssueTemplateFileSystem(access, runExecFileSync ?? execFileSync)
}

function createHostIssueTemplateFileSystem(repoPath: string): IssueTemplateFileSystem {
  return {
    isDirectory(relativePath) {
      const fullPath = path.join(repoPath, relativePath)
      return existsSync(fullPath) && statSync(fullPath).isDirectory()
    },
    isFile(relativePath) {
      const fullPath = path.join(repoPath, relativePath)
      return existsSync(fullPath) && statSync(fullPath).isFile()
    },
    readDir(relativePath) {
      return readdirSync(path.join(repoPath, relativePath))
    },
    readFile(relativePath) {
      return readFileSync(path.join(repoPath, relativePath), 'utf8')
    }
  }
}

function createWslIssueTemplateFileSystem(
  access: Extract<RepoAccessDescriptor, { kind: 'wsl' }>,
  runExecFileSync: ExecFileSync
): IssueTemplateFileSystem {
  const runWsl = (args: string[]): string =>
    String(
      runExecFileSync('wsl.exe', ['-d', access.distro, '--cd', access.linuxPath, '--', ...args], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: WSL_TEMPLATE_COMMAND_TIMEOUT_MS,
        maxBuffer: WSL_TEMPLATE_COMMAND_MAX_BUFFER
      })
    )

  const testPath = (flag: '-d' | '-f', relativePath: string): boolean => {
    try {
      runWsl(['test', flag, normalizeRelativeTemplatePath(relativePath)])
      return true
    } catch (error) {
      if (isExpectedMissingPathError(error)) return false
      throw error
    }
  }

  return {
    isDirectory(relativePath) {
      return testPath('-d', relativePath)
    },
    isFile(relativePath) {
      return testPath('-f', relativePath)
    },
    readDir(relativePath) {
      return runWsl([
        'find',
        normalizeRelativeTemplatePath(relativePath),
        '-maxdepth',
        '1',
        '-type',
        'f',
        '-printf',
        '%f\n'
      ])
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean)
    },
    readFile(relativePath) {
      return runWsl(['cat', normalizeRelativeTemplatePath(relativePath)])
    }
  }
}

function normalizeRelativeTemplatePath(relativePath: string): string {
  return normalizeTemplatePath(relativePath)
}

function isExpectedMissingPathError(error: unknown): boolean {
  return hasExitStatus(error) && error.status === 1
}

function hasExitStatus(error: unknown): error is { status: unknown } {
  return typeof error === 'object' && error !== null && 'status' in error
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function unquoteYamlScalar(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
