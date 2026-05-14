import type { AppUpdateStatus } from '@shared/ipc'
import { useCallback, useEffect, useState } from 'react'

export type UpdateState = {
  status: AppUpdateStatus | null
  check: () => Promise<void>
  download: () => Promise<void>
  restart: () => Promise<void>
}

export function useAppUpdates(): UpdateState {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)

  useEffect(() => {
    let mounted = true
    window.pilog.invoke('app-updates:getStatus').then((next) => {
      if (mounted) setStatus(next)
    })
    const unsubscribe = window.pilog.onUpdateStatus((next) => {
      setStatus(next)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const check = useCallback(async () => {
    setStatus(await window.pilog.invoke('app-updates:check'))
  }, [])

  const download = useCallback(async () => {
    setStatus(await window.pilog.invoke('app-updates:download'))
  }, [])

  const restart = useCallback(async () => {
    setStatus(await window.pilog.invoke('app-updates:restart'))
  }, [])

  return { status, check, download, restart }
}
