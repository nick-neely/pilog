import { describe, expect, it } from 'vitest'
import { extractAcceptanceCriteria, writeAcceptanceCriteria } from './acceptance-criteria'

describe('acceptance criteria markdown helpers', () => {
  it('extracts markdown list items from the acceptance criteria section', () => {
    const body = [
      '## Summary',
      'Fix the settings save flow.',
      '',
      '## Acceptance Criteria',
      '- Save shows a pending state',
      '- Errors stay visible until dismissed',
      '',
      '## Implementation Notes',
      '- Keep the existing form shape'
    ].join('\n')

    expect(extractAcceptanceCriteria(body)).toEqual([
      'Save shows a pending state',
      'Errors stay visible until dismissed'
    ])
  })

  it('writes acceptance criteria changes back into the markdown body', () => {
    const body = [
      '## Summary',
      'Fix the settings save flow.',
      '',
      '## Acceptance Criteria',
      '- Save shows a pending state',
      '',
      '## Implementation Notes',
      '- Keep the existing form shape'
    ].join('\n')

    expect(writeAcceptanceCriteria(body, ['Show loading copy', 'Disable duplicate submits'])).toBe(
      [
        '## Summary',
        'Fix the settings save flow.',
        '',
        '## Acceptance Criteria',
        '- Show loading copy',
        '- Disable duplicate submits',
        '',
        '## Implementation Notes',
        '- Keep the existing form shape'
      ].join('\n')
    )
  })

  it('adds an acceptance criteria section when the draft body does not have one', () => {
    expect(writeAcceptanceCriteria('## Summary\nA short draft.', ['It can be reviewed.'])).toBe(
      ['## Summary', 'A short draft.', '', '## Acceptance Criteria', '- It can be reviewed.'].join(
        '\n'
      )
    )
  })
})
