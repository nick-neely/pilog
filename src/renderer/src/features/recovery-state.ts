export type RecoveryIntent =
  | 'retry'
  | 'settings'
  | 'repositories'
  | 'agent-runs'
  | 'drafts'
  | 'none'

export type RecoveryState = {
  title: string
  description: string
  actionLabel?: string
  intent: RecoveryIntent
}

const CREDENTIAL_ERROR_PATTERN = /credential|api key|provider key/i
const REPOSITORY_ERROR_PATTERN = /repo|repository|local path/i
const GITHUB_VALIDATION_ERROR_PATTERN = /\b422\b|validation failed/i

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function getPiSetupRecoveryState(input: {
  error: string | null
  hasProviders: boolean
}): RecoveryState | null {
  if (!input.error) return null

  return {
    title: input.hasProviders ? 'Pi configuration needs attention' : 'Pi configuration unavailable',
    description: input.hasProviders
      ? 'Pilog could not save the active provider and model. Check the key and try again.'
      : 'Pilog could not read the provider and model list. Check your Pi setup, then try loading it again.',
    actionLabel: 'Try again',
    intent: 'retry'
  }
}

export function getGenerationRecoveryState(input: {
  message: string
  cause?: string | null
}): RecoveryState {
  if (
    input.cause === 'missing-credential' ||
    input.cause === 'auth_invalid' ||
    CREDENTIAL_ERROR_PATTERN.test(input.message)
  ) {
    return {
      title: 'Draft generation needs Pi credentials',
      description:
        'No drafts were created. Add the provider key in Settings, then run generation again.',
      actionLabel: 'Open Settings',
      intent: 'settings'
    }
  }

  if (REPOSITORY_ERROR_PATTERN.test(input.message)) {
    return {
      title: 'Draft generation needs a linked repo',
      description:
        'No drafts were created. Link the note to one local GitHub repository, then generate again.',
      actionLabel: 'Open Repositories',
      intent: 'repositories'
    }
  }

  return {
    title: 'Draft generation stopped',
    description: input.message || 'No drafts were created. Inspect the run, then try again.',
    actionLabel: 'Inspect run',
    intent: 'agent-runs'
  }
}

export function getPublishRecoveryState(error: unknown): RecoveryState {
  const message = error instanceof Error ? error.message : String(error)

  if (GITHUB_VALIDATION_ERROR_PATTERN.test(message)) {
    return {
      title: 'GitHub rejected the issue',
      description:
        'GitHub rejected this issue as invalid. Review the title, body, and labels, then try Publish again.',
      actionLabel: 'Review draft',
      intent: 'drafts'
    }
  }

  return {
    title: 'Publish did not finish',
    description:
      message ||
      'GitHub did not create the issue. Your edits are still here, so you can try again.',
    actionLabel: 'Try again',
    intent: 'retry'
  }
}
