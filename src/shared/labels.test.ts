import { describe, expect, it } from 'vitest'
import {
  filterLabelsForPublish,
  matchLabelsToRepoLabels,
  normalizeLabelKey,
  normalizeLabelsToRepoLabels
} from './labels'

const repoLabels = [
  { name: 'bug' },
  { name: 'ready-for-agent' },
  { name: 'needs info' },
  { name: 'UI/UX' }
]

describe('label matching', () => {
  it('builds a punctuation-insensitive matching key', () => {
    expect(normalizeLabelKey(' Ready_for Agent ')).toBe('readyforagent')
    expect(normalizeLabelKey('UI/UX')).toBe('uiux')
  })

  it('maps exact, case-insensitive, and punctuation variants to repo labels', () => {
    expect(
      normalizeLabelsToRepoLabels(['bug', 'Ready For Agent', 'needs-info', 'ui ux'], repoLabels)
    ).toEqual(['bug', 'ready-for-agent', 'needs info', 'UI/UX'])
  })

  it('keeps unmatched labels visible in the normalization result', () => {
    expect(matchLabelsToRepoLabels(['Bug', 'paper-cut'], repoLabels)).toEqual([
      { input: 'Bug', name: 'bug', matched: true },
      { input: 'paper-cut', name: 'paper-cut', matched: false }
    ])
  })

  it('omits unmatched labels before publish unless they were explicitly kept', () => {
    expect(
      filterLabelsForPublish({
        labels: ['Bug', 'paper-cut', 'ready for agent'],
        repoLabels,
        keptUnmatchedLabels: ['paper-cut']
      })
    ).toEqual(['bug', 'paper-cut', 'ready-for-agent'])

    expect(
      filterLabelsForPublish({
        labels: ['Bug', 'paper-cut'],
        repoLabels
      })
    ).toEqual(['bug'])
  })
})
