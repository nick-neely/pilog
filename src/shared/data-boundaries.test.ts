import {
  AUTO_PUBLISH_EGRESS_DISCLOSURE,
  GENERATION_EGRESS_DISCLOSURE,
  LOCAL_FIRST_DISCLOSURE,
  PUBLISH_EGRESS_DISCLOSURE
} from './data-boundaries'
import { describe, expect, it } from 'vitest'

const expectedDisclosureTerms = {
  localFirst: [
    'Notes, drafts, repo metadata, run history',
    'publish logs stay in local SQLite',
    'OS-backed safe storage'
  ],
  generation: ['selected notes', 'bounded repository context', 'configured Pi provider'],
  publish: ['GitHub write', 'Local drafts stay on this machine'],
  autoPublish: ['generated through your Pi provider', 'writes the selected drafts to GitHub']
} as const

function expectDisclosureToInclude(disclosure: string, terms: readonly string[]): void {
  for (const term of terms) {
    expect(disclosure).toContain(term)
  }
}

describe('data boundary disclosures', () => {
  it('names the local records and OS-backed secret storage used in onboarding and settings', () => {
    expectDisclosureToInclude(LOCAL_FIRST_DISCLOSURE, expectedDisclosureTerms.localFirst)
  })

  it('states provider egress before generation starts', () => {
    expectDisclosureToInclude(GENERATION_EGRESS_DISCLOSURE, expectedDisclosureTerms.generation)
  })

  it('separates generated local drafts from explicit GitHub writes', () => {
    expectDisclosureToInclude(PUBLISH_EGRESS_DISCLOSURE, expectedDisclosureTerms.publish)
    expectDisclosureToInclude(AUTO_PUBLISH_EGRESS_DISCLOSURE, expectedDisclosureTerms.autoPublish)
  })
})
