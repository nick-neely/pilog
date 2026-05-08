import { describe, expect, it } from 'vitest'
import { GeneratedIssueDraftSchema } from './types'

const validDraft = {
  title: 'Fix save loading state',
  summary: 'The save button needs visible pending feedback.',
  context: 'A rough note calls out missing loading feedback during save.',
  sourceNoteIds: ['note-1'],
  suggestedLabels: ['bug'],
  priority: 'medium',
  affectedFiles: [{ path: 'src/save.tsx', reason: 'Likely owns save button state.' }],
  acceptanceCriteria: ['Save button shows a loading state while the request is pending.'],
  implementationNotes: ['Keep the button keyboard accessible.'],
  confidence: 'medium',
  groupingReason: 'Single note maps to one focused issue.',
  publishReady: true,
  needsClarification: []
}

describe('GeneratedIssueDraftSchema', () => {
  it('accepts the PRD section 10 shape', () => {
    expect(GeneratedIssueDraftSchema.parse(validDraft)).toEqual(validDraft)
  })

  it('rejects a missing required field', () => {
    const missingTitle = { ...validDraft } as Partial<typeof validDraft>
    delete missingTitle.title
    expect(() => GeneratedIssueDraftSchema.parse(missingTitle)).toThrow()
  })

  it('rejects a wrong field type', () => {
    expect(() =>
      GeneratedIssueDraftSchema.parse({
        ...validDraft,
        affectedFiles: [{ path: 'src/save.tsx', reason: 42 }]
      })
    ).toThrow()
  })
})
