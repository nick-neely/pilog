import type { GitHubStatus } from '@shared/ipc'
import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../recovery-state'

export function useGitHubStatus(): {
  status: GitHubStatus | null
  connecting: boolean
  error: string | null
  refresh: () => Promise<void>
  connect: () => Promise<GitHubStatus | null>
  signOut: () => Promise<void>
} {
  const [status, setStatus] = useState<GitHubStatus | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setError(null)
      setStatus(await window.pilog.invoke('github:status'))
    } catch (err) {
      setStatus({ connected: false })
      setError(getErrorMessage(err, 'GitHub status could not be read.'))
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(refresh)
  }, [refresh])

  const connect = useCallback(async (): Promise<GitHubStatus | null> => {
    setConnecting(true)
    try {
      setError(null)
      const result = await window.pilog.invoke('github:connect')
      setStatus(result)
      return result
    } catch (err) {
      setStatus({ connected: false })
      setError(getErrorMessage(err, 'GitHub connection did not finish.'))
      return null
    } finally {
      setConnecting(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await window.pilog.invoke('github:signOut')
    setStatus({ connected: false })
  }, [])

  return { status, connecting, error, refresh, connect, signOut }
}
