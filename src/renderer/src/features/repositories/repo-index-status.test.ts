import { describe, expect, it } from 'vitest'
import { getRepoIndexStatusLabel } from './repo-index-status'

describe('getRepoIndexStatusLabel', () => {
  it('maps a ready Repo Index to a last-indexed label', () => {
    const view = getRepoIndexStatusLabel({
      status: 'ready',
      lastIndexedAt: '2026-05-14T12:30:00.000Z',
      indexVersion: 1,
      packageManager: 'pnpm',
      frameworkSignals: ['React', 'Vite'],
      importantDirectories: [{ path: 'src', role: 'Source' }],
      exclusionSummary: { dependency: 1, buildOutput: 1, generated: 0, binaryHeavy: 0, ignored: 1 },
      errorMessage: null
    })

    expect(view.label).toContain('Indexed')
    expect(view.ariaLabel).toContain('Repo Index last indexed')
  })

  it('maps missing and failed Repo Index states without hiding failures', () => {
    expect(getRepoIndexStatusLabel(null)).toEqual({
      label: 'Not created',
      ariaLabel: 'Repo Index not created'
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
      ariaLabel: 'Repo Index failed: EACCES: permission denied'
    })
  })
})
