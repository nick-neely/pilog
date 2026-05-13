import { describe, expect, it } from 'vitest'
import { getDetectResultRecoveryContent } from './repo-link-copy'
import type {
  DetectLocalRepoResult,
  RepoAccessDescriptor,
  WslRepoDetectionFailureReason
} from '@shared/ipc'

type WslFailureResult = Extract<DetectLocalRepoResult, { state: 'wsl-failure' }>

describe('repository link recovery copy', () => {
  it('names missing Git inside WSL instead of calling the path a non-repo', () => {
    const result: DetectLocalRepoResult = {
      state: 'wsl-failure',
      reason: 'git-missing',
      access: {
        kind: 'wsl',
        displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
        distro: 'Ubuntu',
        linuxPath: '/home/neely/dev/pilog'
      }
    }

    expect(
      getDetectResultRecoveryContent('\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog', result)
    ).toEqual({
      path: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
      message: 'Git is not available inside Ubuntu.',
      recoveryAction: 'Install Git in that WSL distro, then choose the repository again.'
    })
  })

  it('gives each WSL linking failure a direct recovery action', () => {
    const access: Extract<RepoAccessDescriptor, { kind: 'wsl' }> = {
      kind: 'wsl',
      displayPath: '\\\\wsl.localhost\\Ubuntu\\home\\neely\\dev\\pilog',
      distro: 'Ubuntu',
      linuxPath: '/home/neely/dev/pilog'
    }
    const reasons: WslRepoDetectionFailureReason[] = [
      'wsl-unavailable',
      'distro-unavailable',
      'path-missing',
      'not-git',
      'no-origin',
      'unmatched'
    ]

    expect(
      reasons.map((reason) => {
        const result: WslFailureResult = {
          state: 'wsl-failure',
          reason,
          access,
          remoteUrl: reason === 'unmatched' ? 'https://github.com/other/project.git' : undefined
        }
        return getDetectResultRecoveryContent(access.displayPath, result)
      })
    ).toEqual([
      {
        path: access.displayPath,
        message: 'WSL is not available to Pilog.',
        recoveryAction: 'Install or enable WSL on Windows, then choose the repository again.'
      },
      {
        path: access.displayPath,
        message: 'Ubuntu is not available through WSL.',
        recoveryAction: 'Start or install that WSL distro, then choose the repository again.'
      },
      {
        path: access.displayPath,
        message: 'That WSL path is not available.',
        recoveryAction: 'Choose an existing folder inside the distro.'
      },
      {
        path: access.displayPath,
        message: 'That WSL folder is not a Git repository root.',
        recoveryAction: 'Choose the repository root inside WSL, or initialize Git in that folder.'
      },
      {
        path: access.displayPath,
        message: 'That WSL repository has no origin remote configured.',
        recoveryAction: 'Add a GitHub origin remote inside WSL, then choose the repository again.'
      },
      {
        path: access.displayPath,
        remoteUrl: 'https://github.com/other/project.git',
        message: 'That WSL repository origin is not visible to your GitHub account.',
        recoveryAction:
          'Connect the right GitHub account, or choose a WSL repo with a visible GitHub origin.'
      }
    ])
  })
})
