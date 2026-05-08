import { useCallback, useEffect, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import type { DetectLocalRepoResult, GitHubRepo, Repo } from '@shared/ipc'

function useRepos(): {
  repos: Repo[]
  reload: () => Promise<void>
} {
  const [repos, setRepos] = useState<Repo[]>([])

  const reload = useCallback(async () => {
    const list = await window.pilog.invoke('repos:list')
    setRepos(list)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { repos, reload }
}

type AddRepoState =
  | { step: 'idle' }
  | { step: 'detecting'; localPath: string }
  | { step: 'result'; localPath: string; result: DetectLocalRepoResult }
  | { step: 'confirming'; localPath: string; githubRepo: GitHubRepo; defaultBranch: string }
  | { step: 'linking' }

function DetectResultInline({
  localPath,
  result,
  onConfirm,
  onReset
}: {
  localPath: string
  result: DetectLocalRepoResult
  onConfirm: (githubRepo: GitHubRepo, defaultBranch: string) => void
  onReset: () => void
}): React.JSX.Element {
  if (result.state === 'unauthenticated') {
    return (
      <p className="text-sm text-destructive">
        Connect your GitHub account in Settings before adding a repository.
      </p>
    )
  }

  if (result.state === 'not-git') {
    return (
      <p className="text-sm text-destructive">
        <span className="font-mono text-xs">{localPath}</span> is not a Git repository.
      </p>
    )
  }

  if (result.state === 'no-remote') {
    return (
      <p className="text-sm text-destructive">
        <span className="font-mono text-xs">{localPath}</span> has no origin remote configured.
      </p>
    )
  }

  if (result.state === 'unmatched') {
    return (
      <p className="text-sm text-destructive">
        Remote <span className="font-mono text-xs">{result.remoteUrl}</span> does not match any
        GitHub repository visible to your account.
      </p>
    )
  }

  const { githubRepo, defaultBranch } = result
  return (
    <div className="space-y-3 rounded-md border px-4 py-3">
      <div>
        <p className="text-sm font-medium">{githubRepo.fullName}</p>
        <p className="text-xs text-muted-foreground">
          Default branch: <span className="font-mono">{defaultBranch}</span>
        </p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{localPath}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => onConfirm(githubRepo, defaultBranch)}>
          Link repository
        </Button>
        <Button size="sm" variant="ghost" onClick={onReset}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function AddRepoFlow({ onLinked }: { onLinked: () => void }): React.JSX.Element {
  const [state, setState] = useState<AddRepoState>({ step: 'idle' })

  const handlePickDirectory = async (): Promise<void> => {
    const localPath = await window.pilog.invoke('dialog:openDirectory')
    if (!localPath) return

    setState({ step: 'detecting', localPath })
    const result = await window.pilog.invoke('repos:detectLocal', { localPath })
    setState({ step: 'result', localPath, result })
  }

  const handleConfirm = async (githubRepo: GitHubRepo, defaultBranch: string): Promise<void> => {
    if (state.step !== 'result') return
    setState({ step: 'linking' })
    await window.pilog.invoke('repos:link', {
      localPath: state.localPath,
      githubRepo,
      defaultBranch
    })
    setState({ step: 'idle' })
    onLinked()
  }

  const handleReset = (): void => setState({ step: 'idle' })

  if (state.step === 'linking') {
    return <p className="text-sm text-muted-foreground">Linking repository…</p>
  }

  return (
    <div className="space-y-3">
      {state.step === 'idle' && (
        <Button size="sm" onClick={handlePickDirectory}>
          Add local repo
        </Button>
      )}

      {state.step === 'detecting' && (
        <p className="text-sm text-muted-foreground">
          Detecting{' '}
          <span className="font-mono text-xs">{state.localPath}</span>…
        </p>
      )}

      {state.step === 'result' && (
        <div className="space-y-3">
          <DetectResultInline
            localPath={state.localPath}
            result={state.result}
            onConfirm={handleConfirm}
            onReset={handleReset}
          />
          {state.result.state !== 'matched' && (
            <Button size="sm" variant="ghost" onClick={handlePickDirectory}>
              Try a different directory
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function RepoRow({ repo, onUnlink }: { repo: Repo; onUnlink: (id: string) => void }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between rounded-md border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {repo.owner}/{repo.name}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{repo.localPath}</p>
        {repo.defaultBranch && (
          <p className="text-xs text-muted-foreground">
            Branch: <span className="font-mono">{repo.defaultBranch}</span>
          </p>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={() => onUnlink(repo.id)}>
        Remove
      </Button>
    </div>
  )
}

export function Repositories({ onBack }: { onBack: () => void }): React.JSX.Element {
  const { repos, reload } = useRepos()

  const handleUnlink = async (id: string): Promise<void> => {
    await window.pilog.invoke('repos:unlink', { id })
    await reload()
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-xl font-semibold">Repositories</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg space-y-6">
          {repos.length > 0 && (
            <section className="space-y-2">
              {repos.map((repo) => (
                <RepoRow key={repo.id} repo={repo} onUnlink={handleUnlink} />
              ))}
            </section>
          )}

          {repos.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No repositories linked yet. Add a local Git repository to get started.
            </p>
          )}

          <section>
            <AddRepoFlow onLinked={reload} />
          </section>
        </div>
      </div>
    </div>
  )
}
