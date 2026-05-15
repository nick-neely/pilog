import type { Repo } from '@shared/ipc'
import { useCallback, useEffect, useState } from 'react'

export function useRepos(): {
  repos: Repo[]
  reload: () => Promise<void>
} {
  const [repos, setRepos] = useState<Repo[]>([])

  const reload = useCallback(async () => {
    const list = await window.pilog.invoke('repos:list')
    setRepos(list)
  }, [])

  useEffect(() => {
    window.pilog.invoke('repos:list').then(setRepos)
  }, [])

  return { repos, reload }
}
