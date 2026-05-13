import type { DetectLocalRepoResult } from '@shared/ipc'

export type DetectResultRecoveryContent = {
  path?: string
  remoteUrl?: string
  message: string
  recoveryAction?: string
}

export function getDetectResultRecoveryContent(
  localPath: string,
  result: DetectLocalRepoResult
): DetectResultRecoveryContent | null {
  switch (result.state) {
    case 'runtime-blocked':
      return {
        message: result.message,
        recoveryAction: result.recoveryAction
      }
    case 'unauthenticated':
      return {
        message: 'Connect your GitHub account before adding a repository.'
      }
    case 'not-git':
      return {
        path: localPath,
        message: 'This directory is not a Git repository.',
        recoveryAction: 'Choose the repository root, or initialize Git in that folder.'
      }
    case 'no-remote':
      return {
        path: localPath,
        message: 'This repository has no origin remote configured.',
        recoveryAction: 'Add a GitHub origin remote, then choose the repository again.'
      }
    case 'unmatched':
      return {
        remoteUrl: result.remoteUrl,
        message: 'This origin does not match any GitHub repository visible to your account.',
        recoveryAction:
          'Connect the right GitHub account, or choose a repository with a visible GitHub origin.'
      }
    case 'wsl-failure':
      return getWslFailureContent(result)
    case 'matched':
      return null
  }
}

function getWslFailureContent(
  result: Extract<DetectLocalRepoResult, { state: 'wsl-failure' }>
): DetectResultRecoveryContent {
  const { access } = result

  switch (result.reason) {
    case 'wsl-unavailable':
      return {
        path: access.displayPath,
        message: 'WSL is not available to Pilog.',
        recoveryAction: 'Install or enable WSL on Windows, then choose the repository again.'
      }
    case 'distro-unavailable':
      return {
        path: access.displayPath,
        message: `${access.distro} is not available through WSL.`,
        recoveryAction: 'Start or install that WSL distro, then choose the repository again.'
      }
    case 'git-missing':
      return {
        path: access.displayPath,
        message: `Git is not available inside ${access.distro}.`,
        recoveryAction: 'Install Git in that WSL distro, then choose the repository again.'
      }
    case 'path-missing':
      return {
        path: access.displayPath,
        message: 'That WSL path is not available.',
        recoveryAction: 'Choose an existing folder inside the distro.'
      }
    case 'not-git':
      return {
        path: access.displayPath,
        message: 'That WSL folder is not a Git repository root.',
        recoveryAction: 'Choose the repository root inside WSL, or initialize Git in that folder.'
      }
    case 'no-origin':
      return {
        path: access.displayPath,
        message: 'That WSL repository has no origin remote configured.',
        recoveryAction: 'Add a GitHub origin remote inside WSL, then choose the repository again.'
      }
    case 'unmatched':
      return {
        path: access.displayPath,
        remoteUrl: result.remoteUrl,
        message: 'That WSL repository origin is not visible to your GitHub account.',
        recoveryAction:
          'Connect the right GitHub account, or choose a WSL repo with a visible GitHub origin.'
      }
  }
}
