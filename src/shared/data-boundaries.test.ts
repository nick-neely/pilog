import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  AUTO_PUBLISH_EGRESS_DISCLOSURE,
  GENERATION_EGRESS_DISCLOSURE,
  LOCAL_FIRST_DISCLOSURE,
  PUBLISH_EGRESS_DISCLOSURE
} from './data-boundaries'

function readProjectFile(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

describe('data boundary disclosures', () => {
  it('names the local records and OS-backed secret storage used in onboarding and settings', () => {
    expect(LOCAL_FIRST_DISCLOSURE).toContain('Notes, drafts, repo metadata, run history')
    expect(LOCAL_FIRST_DISCLOSURE).toContain('publish logs stay in local SQLite')
    expect(LOCAL_FIRST_DISCLOSURE).toContain('OS-backed safe storage')
  })

  it('states provider egress before generation starts', () => {
    expect(GENERATION_EGRESS_DISCLOSURE).toContain('selected notes')
    expect(GENERATION_EGRESS_DISCLOSURE).toContain('bounded repository context')
    expect(GENERATION_EGRESS_DISCLOSURE).toContain('configured Pi provider')
  })

  it('separates generated local drafts from explicit GitHub writes', () => {
    expect(PUBLISH_EGRESS_DISCLOSURE).toContain('GitHub write')
    expect(PUBLISH_EGRESS_DISCLOSURE).toContain('Local drafts stay on this machine')
    expect(AUTO_PUBLISH_EGRESS_DISCLOSURE).toContain('generated through your Pi provider')
    expect(AUTO_PUBLISH_EGRESS_DISCLOSURE).toContain('writes the selected drafts to GitHub')
  })

  it('is wired into onboarding, settings, and generation entry points', () => {
    const inbox = readProjectFile('src/renderer/src/features/inbox/Inbox.tsx')
    const settings = readProjectFile('src/renderer/src/features/settings/Settings.tsx')
    const piSetup = readProjectFile('src/renderer/src/features/setup/PiSetupPanel.tsx')

    expect(inbox).toContain('onboarding-local-first-disclosure')
    expect(settings).toContain('settings-local-first-disclosure')
    expect(piSetup).toContain('GENERATION_EGRESS_DISCLOSURE')
    expect(inbox).toContain('generation-boundary-disclosure')
  })
})
