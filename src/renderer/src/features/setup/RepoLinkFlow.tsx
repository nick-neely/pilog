import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import type { DetectLocalRepoResult, GitHubRepo, RepoAccessDescriptor } from '@shared/ipc'
import { useState } from 'react'
import { getErrorMessage } from '../recovery-state'

type AddRepoState =
  | { step: 'idle' }
  | { step: 'detecting'; localPath: string }
  | { step: 'result'; localPath: string; result: DetectLocalRepoResult }
  | { step: 'linking' }
  | { step: 'error'; localPath?: string; message: string }

function DetectResultInline({
  localPath,
  result,
  onConfirm,
  onReset,
  onGitHubRequired,
  githubRequiredLabel = 'Connect GitHub'
}: {
  localPath: string
  result: DetectLocalRepoResult
  onConfirm: (githubRepo: GitHubRepo, defaultBranch: string, access: RepoAccessDescriptor) => void
  onReset: () => void
  onGitHubRequired?: () => void
  githubRequiredLabel?: string
}): React.JSX.Element {
  if (result.state === 'runtime-blocked') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span className="block">{result.message}</span>
          {onGitHubRequired ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onGitHubRequired}
            >
              {githubRequiredLabel}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  if (result.state === 'unauthenticated') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span className="block">Connect your GitHub account before adding a repository.</span>
          {onGitHubRequired ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={onGitHubRequired}
            >
              {githubRequiredLabel}
            </Button>
          ) : null}
        </AlertDescription>
      </Alert>
    )
  }

  if (result.state === 'not-git') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span className="font-mono text-xs">{localPath}</span> is not a Git repository.
        </AlertDescription>
      </Alert>
    )
  }

  if (result.state === 'no-remote') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          <span className="font-mono text-xs">{localPath}</span> has no origin remote configured.
        </AlertDescription>
      </Alert>
    )
  }

  if (result.state === 'unmatched') {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Remote <span className="font-mono text-xs">{result.remoteUrl}</span> does not match any
          GitHub repository visible to your account.
        </AlertDescription>
      </Alert>
    )
  }

  const { githubRepo, defaultBranch } = result
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">{githubRepo.fullName}</p>
          <p className="text-xs text-muted-foreground">
            Default branch: <span className="font-mono">{defaultBranch}</span>
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{localPath}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onConfirm(githubRepo, defaultBranch, result.access)}>
            Link repository
          </Button>
          <Button size="sm" variant="ghost" onClick={onReset}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}

export function RepoLinkFlow({
  onLinked,
  onGitHubRequired,
  idleLabel = 'Add local repo',
  githubRequiredLabel
}: {
  onLinked: () => void
  onGitHubRequired?: () => void
  idleLabel?: string
  githubRequiredLabel?: string
}): React.JSX.Element {
  const [state, setState] = useState<AddRepoState>({ step: 'idle' })

  const handlePickDirectory = async (): Promise<void> => {
    const localPath = await window.pilog.invoke('dialog:openDirectory')
    if (!localPath) return

    setState({ step: 'detecting', localPath })
    try {
      const result = await window.pilog.invoke('repos:detectLocal', { localPath })
      setState({ step: 'result', localPath, result })
    } catch (err) {
      setState({
        step: 'error',
        localPath,
        message: getErrorMessage(err, 'Repository detection failed.')
      })
    }
  }

  const handleConfirm = async (
    githubRepo: GitHubRepo,
    defaultBranch: string,
    access: RepoAccessDescriptor
  ): Promise<void> => {
    if (state.step !== 'result') return
    setState({ step: 'linking' })
    try {
      await window.pilog.invoke('repos:link', {
        localPath: state.localPath,
        access,
        githubRepo,
        defaultBranch
      })
      setState({ step: 'idle' })
      onLinked()
    } catch (err) {
      setState({
        step: 'error',
        localPath: state.localPath,
        message: getErrorMessage(err, 'Repository could not be linked.')
      })
    }
  }

  const handleReset = (): void => setState({ step: 'idle' })

  if (state.step === 'linking') {
    return <p className="text-sm text-muted-foreground">Linking repository...</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {state.step === 'idle' && (
        <Button size="sm" onClick={handlePickDirectory}>
          {idleLabel}
        </Button>
      )}

      {state.step === 'detecting' && (
        <p className="text-sm text-muted-foreground">
          Detecting <span className="font-mono text-xs">{state.localPath}</span>...
        </p>
      )}

      {state.step === 'result' && (
        <div className="flex flex-col gap-3">
          <DetectResultInline
            localPath={state.localPath}
            result={state.result}
            onConfirm={handleConfirm}
            onReset={handleReset}
            onGitHubRequired={onGitHubRequired}
            githubRequiredLabel={githubRequiredLabel}
          />
          {state.result.state !== 'matched' && (
            <Button size="sm" variant="ghost" onClick={handlePickDirectory}>
              Try a different directory
            </Button>
          )}
        </div>
      )}

      {state.step === 'error' && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="block">Pilog could not finish linking this repository.</span>
            {state.localPath ? (
              <span className="mt-1 block font-mono text-xs">{state.localPath}</span>
            ) : null}
            <span className="mt-1 block font-mono text-xs">{state.message}</span>
            <span className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" onClick={handlePickDirectory}>
                Try another directory
              </Button>
              <Button size="sm" variant="ghost" onClick={handleReset}>
                Cancel
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
