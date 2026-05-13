import type { GitHubAuthProgress, GitHubStatus } from '@shared/ipc'

export function mergeGitHubAuthProgress(
  current: GitHubStatus | null | undefined,
  auth: GitHubAuthProgress
): GitHubStatus {
  if (
    current?.auth?.state === 'device_code' &&
    (auth.state === 'polling' || auth.state === 'slow_down')
  ) {
    return current
  }

  return {
    connected: current?.connected ?? false,
    login: current?.login,
    auth
  }
}
