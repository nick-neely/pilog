import { describe, expect, it } from 'vitest'
import { DEFAULT_REPO_DRAFT_SETTINGS, type Note } from '@shared/ipc'
import type { GenerationRepoIndexStatusView } from '../repositories/repo-index-status'
import { getGenerationContextRowView } from './generation-context-row'

const FRESH_INDEX: GenerationRepoIndexStatusView = {
  state: 'fresh',
  label: 'Repo Index fresh, indexed May 14, 2026, 12:30 PM',
  shortLabel: 'Indexed May 14, 2026, 12:30 PM',
  ariaLabel: 'Repo Index fresh for pilog. Last indexed May 14, 2026, 12:30 PM',
  notice: null,
  blocksGeneration: false
}

function note(input: Partial<Note>): Note {
  return {
    id: 'note-1',
    content: 'note',
    status: 'unprocessed',
    repoId: 'repo-1',
    runId: null,
    captureContext: null,
    createdAt: '2026-05-14T12:00:00.000Z',
    updatedAt: '2026-05-14T12:00:00.000Z',
    ...input
  }
}

describe('getGenerationContextRowView', () => {
  it('summarizes complete Repo Index, Capture Context, changed-file, and style context', () => {
    const view = getGenerationContextRowView({
      repoIndexStatus: FRESH_INDEX,
      notes: [
        note({
          captureContext: {
            state: 'captured',
            branch: 'feat/auth',
            dirtyFiles: ['src/auth.ts', 'src/session.ts'],
            stagedFiles: ['src/session.ts', 'src/ui.ts'],
            headSha: '1234567890abcdef',
            headSubject: 'Add auth shell',
            capturedAt: '2026-05-14T12:00:00.000Z'
          }
        })
      ],
      draftSettings: DEFAULT_REPO_DRAFT_SETTINGS
    })

    expect(view?.items).toEqual([
      { label: 'Repo Index', value: 'Fresh' },
      { label: 'Branch', value: 'feat/auth' },
      { label: 'Changed files', value: '3' },
      { label: 'Style', value: 'balanced / internal, 6 of 6 sections on.' }
    ])
    expect(view?.ariaLabel).toContain('Repo Index: Fresh')
    expect(view?.ariaLabel).toContain('Branch: feat/auth')
  })

  it('uses partial context quietly without requiring every signal', () => {
    const view = getGenerationContextRowView({
      repoIndexStatus: {
        ...FRESH_INDEX,
        state: 'stale',
        shortLabel: 'Stale, indexed May 1, 2026',
        label: 'Repo Index stale, indexed May 1, 2026'
      },
      notes: [
        note({
          id: 'note-1',
          captureContext: {
            state: 'captured',
            branch: 'feat/auth',
            dirtyFiles: [],
            stagedFiles: [],
            headSha: null,
            headSubject: null,
            diffSummary: { filesChanged: 4, insertions: 12, deletions: 3 },
            capturedAt: '2026-05-14T12:00:00.000Z'
          }
        }),
        note({
          id: 'note-2',
          captureContext: {
            state: 'captured',
            branch: 'fix/settings',
            dirtyFiles: [],
            stagedFiles: [],
            headSha: null,
            headSubject: null,
            capturedAt: '2026-05-14T12:01:00.000Z'
          }
        })
      ],
      draftSettings: {
        ...DEFAULT_REPO_DRAFT_SETTINGS,
        issueStyleAudience: 'open_source'
      }
    })

    expect(view?.items).toEqual([
      { label: 'Repo Index', value: 'Stale' },
      { label: 'Branches', value: '2' },
      { label: 'Changed files', value: '4' },
      { label: 'Style', value: 'balanced / open source, 6 of 6 sections on.' }
    ])
  })

  it('falls back to the active Issue Style when note and index context is missing', () => {
    const view = getGenerationContextRowView({
      repoIndexStatus: null,
      notes: [note({ captureContext: null })],
      draftSettings: {
        ...DEFAULT_REPO_DRAFT_SETTINGS,
        issueStyleDepth: 'concise'
      }
    })

    expect(view?.items).toEqual([
      { label: 'Style', value: 'concise / internal, 6 of 6 sections on.' }
    ])
  })
})
