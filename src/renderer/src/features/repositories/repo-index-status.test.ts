import { describe, expect, it } from 'vitest'
import {
  REPO_INDEX_PRIVACY_COPY,
  getGenerationRepoIndexStatus,
  getRepoIndexStatusLabel
} from './repo-index-status'

const READY_INDEX = {
  status: 'ready' as const,
  lastIndexedAt: '2026-05-14T12:30:00.000Z',
  indexVersion: 1,
  packageManager: 'pnpm',
  frameworkSignals: ['React', 'Vite'],
  importantDirectories: [{ path: 'src', role: 'Source' }],
  exclusionSummary: { dependency: 1, buildOutput: 1, generated: 0, binaryHeavy: 0, ignored: 1 },
  errorMessage: null
}

describe('getRepoIndexStatusLabel', () => {
  it('maps a ready Repo Index to a last-indexed label', () => {
    const view = getRepoIndexStatusLabel(READY_INDEX)

    expect(view.label).toContain('Indexed')
    expect(view.ariaLabel).toContain('Repo Index last indexed')
  })

  it('maps missing and failed Repo Index states without hiding failures', () => {
    expect(getRepoIndexStatusLabel(null)).toEqual({
      label: 'Not created',
      ariaLabel: 'Repo Index not created',
      canRefresh: false
    })

    expect(
      getRepoIndexStatusLabel({
        status: 'failed',
        lastIndexedAt: null,
        indexVersion: 1,
        packageManager: null,
        frameworkSignals: [],
        importantDirectories: [],
        exclusionSummary: {
          dependency: 0,
          buildOutput: 0,
          generated: 0,
          binaryHeavy: 0,
          ignored: 0
        },
        errorMessage: 'EACCES: permission denied'
      })
    ).toEqual({
      label: 'Failed: EACCES: permission denied',
      ariaLabel: 'Repo Index failed: EACCES: permission denied',
      canRefresh: true
    })
  })

  it('maps an active refresh without losing the previous freshness label', () => {
    const view = getRepoIndexStatusLabel(
      {
        status: 'ready',
        lastIndexedAt: '2026-05-14T12:30:00.000Z',
        indexVersion: 1,
        packageManager: 'pnpm',
        frameworkSignals: [],
        importantDirectories: [],
        exclusionSummary: {
          dependency: 0,
          buildOutput: 0,
          generated: 0,
          binaryHeavy: 0,
          ignored: 0
        },
        errorMessage: null
      },
      { refreshing: true }
    )

    expect(view).toEqual({
      label: expect.stringContaining('Refreshing'),
      ariaLabel: expect.stringContaining('Repo Index refresh in progress'),
      canRefresh: false
    })
  })

  it('explains the Repo Index privacy boundary in product-facing copy', () => {
    expect(REPO_INDEX_PRIVACY_COPY).toContain('structure and lightweight signals')
    expect(REPO_INDEX_PRIVACY_COPY).toContain('File contents')
    expect(REPO_INDEX_PRIVACY_COPY).toContain('embeddings')
    expect(REPO_INDEX_PRIVACY_COPY).toContain('long code summaries')
    expect(REPO_INDEX_PRIVACY_COPY).toContain('Live Repo Evidence')
  })
})

describe('getGenerationRepoIndexStatus', () => {
  it('shows fresh Repo Index context without a notice', () => {
    const view = getGenerationRepoIndexStatus(
      { name: 'pilog', repoIndex: READY_INDEX },
      { now: new Date('2026-05-14T13:00:00.000Z') }
    )

    expect(view.state).toBe('fresh')
    expect(view.label).toContain('fresh')
    expect(view.notice).toBeNull()
    expect(view.blocksGeneration).toBe(false)
  })

  it('shows stale Repo Index context as non-blocking live-check guidance', () => {
    const view = getGenerationRepoIndexStatus(
      {
        name: 'pilog',
        repoIndex: { ...READY_INDEX, lastIndexedAt: '2026-05-01T12:30:00.000Z' }
      },
      { now: new Date('2026-05-14T13:00:00.000Z') }
    )

    expect(view.state).toBe('stale')
    expect(view.label).toContain('stale')
    expect(view.notice).toContain('Live Repo Evidence')
    expect(view.notice).toContain('specific file claims')
    expect(view.blocksGeneration).toBe(false)
  })

  it('shows missing Repo Index context as non-blocking live-check guidance', () => {
    const view = getGenerationRepoIndexStatus(
      { name: 'pilog', repoIndex: null },
      { now: new Date('2026-05-14T13:00:00.000Z') }
    )

    expect(view.state).toBe('missing')
    expect(view.label).toContain('missing')
    expect(view.notice).toContain('Live Repo Evidence')
    expect(view.notice).toContain('specific file claims')
    expect(view.blocksGeneration).toBe(false)
  })

  it('shows unavailable repos as blocking readiness state', () => {
    const view = getGenerationRepoIndexStatus(null, {
      now: new Date('2026-05-14T13:00:00.000Z')
    })

    expect(view.state).toBe('unavailable')
    expect(view.label).toContain('unavailable')
    expect(view.notice).toContain('Relink')
    expect(view.blocksGeneration).toBe(true)
  })
})
