import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import type { GeneratedIssueDraft, GitHubIssueTemplate } from '@shared/types'

type FrontMatter = {
  body: string
  fields: Record<string, string>
}

type DraftSection = {
  heading: string
  content: string
}

const ISSUE_TEMPLATE_DIR = path.join('.github', 'ISSUE_TEMPLATE')
const SINGLE_ISSUE_TEMPLATE = path.join('.github', 'ISSUE_TEMPLATE.md')
const CONFIG_TEMPLATE_NAMES = new Set(['config.yml', 'config.yaml'])

export function listLocalIssueTemplates(repoPath: string): GitHubIssueTemplate[] {
  const templates: GitHubIssueTemplate[] = []
  const templateDir = path.join(repoPath, ISSUE_TEMPLATE_DIR)

  if (existsSync(templateDir) && statSync(templateDir).isDirectory()) {
    const templateFiles = readdirSync(templateDir)
      .filter((file) => isTemplateFile(file) && !CONFIG_TEMPLATE_NAMES.has(file.toLowerCase()))
      .sort((a, b) => a.localeCompare(b))

    for (const file of templateFiles) {
      const relativePath = path.join(ISSUE_TEMPLATE_DIR, file)
      const fullPath = path.join(repoPath, relativePath)
      const content = readFileSync(fullPath, 'utf8')

      if (isYamlTemplate(file)) {
        templates.push(parseYamlIssueTemplate(relativePath, content))
      } else {
        templates.push(parseMarkdownIssueTemplate(relativePath, content))
      }
    }
  }

  const singleTemplatePath = path.join(repoPath, SINGLE_ISSUE_TEMPLATE)
  if (existsSync(singleTemplatePath) && statSync(singleTemplatePath).isFile()) {
    templates.push(
      parseMarkdownIssueTemplate(SINGLE_ISSUE_TEMPLATE, readFileSync(singleTemplatePath, 'utf8'))
    )
  }

  return templates
}

export function resolveDefaultIssueTemplate(repoPath: string): GitHubIssueTemplate | null {
  return listLocalIssueTemplates(repoPath)[0] ?? null
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
