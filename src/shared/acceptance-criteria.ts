const ACCEPTANCE_HEADING = /^##\s+Acceptance Criteria\s*$/i
const NEXT_SECTION_HEADING = /^##\s+\S/
const LIST_ITEM = /^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+?)\s*$/

export function extractAcceptanceCriteria(body: string): string[] {
  const lines = body.split('\n')
  const section = findAcceptanceCriteriaSection(lines)
  if (!section) return []

  return lines
    .slice(section.contentStart, section.contentEnd)
    .map((line) => line.match(LIST_ITEM)?.[1]?.trim() ?? '')
    .filter(Boolean)
}

export function writeAcceptanceCriteria(body: string, items: string[]): string {
  const normalizedItems = items.map((item) => item.trim()).filter(Boolean)
  const nextSection = ['## Acceptance Criteria', ...normalizedItems.map((item) => `- ${item}`)]
  const lines = body.split('\n')
  const section = findAcceptanceCriteriaSection(lines)

  if (!section) {
    const prefix = body.trimEnd()
    return [prefix, '', ...nextSection].filter((line, index) => index !== 0 || line).join('\n')
  }

  const before = lines.slice(0, section.headingIndex)
  const after = lines.slice(section.contentEnd)
  const needsGapBeforeNextSection =
    after.length > 0 && after[0] !== '' && NEXT_SECTION_HEADING.test(after[0])

  return [...before, ...nextSection, ...(needsGapBeforeNextSection ? [''] : []), ...after].join(
    '\n'
  )
}

function findAcceptanceCriteriaSection(
  lines: string[]
): { headingIndex: number; contentStart: number; contentEnd: number } | null {
  const headingIndex = lines.findIndex((line) => ACCEPTANCE_HEADING.test(line))
  if (headingIndex === -1) return null

  let contentEnd = lines.length
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    if (NEXT_SECTION_HEADING.test(lines[index])) {
      contentEnd = index
      break
    }
  }

  return {
    headingIndex,
    contentStart: headingIndex + 1,
    contentEnd
  }
}
