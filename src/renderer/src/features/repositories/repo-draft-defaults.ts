import type { RepoDraftSettings } from '@shared/ipc'

export const DRAFT_CONTENT_TOGGLE_LABELS: Array<{
  key: keyof RepoDraftSettings['draftContentToggles']
  label: string
  description: string
}> = [
  {
    key: 'includeImplementationNotes',
    label: 'Implementation notes',
    description: 'Add implementation context when Pilog can support it.'
  },
  {
    key: 'includeAffectedFiles',
    label: 'Affected files',
    description: 'Name relevant paths only when live evidence supports them.'
  },
  {
    key: 'includeSourceNotes',
    label: 'Source notes',
    description: 'Keep generated drafts visibly tied to the notes that produced them.'
  },
  {
    key: 'includeAcceptanceCriteria',
    label: 'Acceptance criteria',
    description: 'Ask Pilog for concrete review checks.'
  },
  {
    key: 'includeConfidenceRationale',
    label: 'Confidence and rationale',
    description: 'Show the confidence level and short grouping reason.'
  },
  {
    key: 'includeReproductionSteps',
    label: 'Reproduction steps',
    description: 'Include steps when the source notes describe a bug path.'
  }
]

export function draftSettingsSummary(settings: RepoDraftSettings): string {
  const depth = settings.issueStyleDepth.replaceAll('_', ' ')
  const audience =
    settings.issueStyleAudience === 'open_source' ? 'open source' : settings.issueStyleAudience
  const enabledCount = Object.values(settings.draftContentToggles).filter(Boolean).length
  return `${depth} / ${audience}, ${enabledCount} of ${DRAFT_CONTENT_TOGGLE_LABELS.length} sections on.`
}
