import { describe, expect, it } from 'vitest'
import { mergeGitHubAuthProgress } from './github-auth-progress'

describe('mergeGitHubAuthProgress', () => {
  it('keeps the device code visible while GitHub auth is polling', () => {
    const current = {
      connected: false,
      auth: {
        state: 'device_code' as const,
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
        expiresAt: '2026-05-13T03:00:00.000Z',
        intervalSeconds: 5
      }
    }

    expect(
      mergeGitHubAuthProgress(current, {
        state: 'polling',
        message: 'Waiting for GitHub authorization.'
      })
    ).toEqual(current)
  })

  it('replaces the device code when authorization finishes', () => {
    expect(
      mergeGitHubAuthProgress(
        {
          connected: false,
          auth: {
            state: 'device_code',
            userCode: 'ABCD-1234',
            verificationUri: 'https://github.com/login/device',
            expiresAt: '2026-05-13T03:00:00.000Z',
            intervalSeconds: 5
          }
        },
        { state: 'authorized', login: 'nick-neely' }
      )
    ).toEqual({
      connected: false,
      auth: { state: 'authorized', login: 'nick-neely' }
    })
  })
})
