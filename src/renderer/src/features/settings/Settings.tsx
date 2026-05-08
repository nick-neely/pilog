import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import type { GitHubStatus, SettingKey } from '@shared/ipc'

function useSetting(key: SettingKey): [string | null, (value: string) => Promise<void>] {
  const [value, setValue] = useState<string | null>(null)
  const fetchIdRef = useRef(0)

  useEffect(() => {
    const id = ++fetchIdRef.current
    window.pilog.invoke('setting:get', { key }).then((result) => {
      if (id === fetchIdRef.current) setValue(result)
    })
  }, [key])

  const update = useCallback(
    async (next: string) => {
      await window.pilog.invoke('setting:set', { key, value: next })
      setValue(next)
    },
    [key]
  )

  return [value, update]
}

function useGitHubStatus(): {
  status: GitHubStatus | null
  connecting: boolean
  connect: () => Promise<void>
  signOut: () => Promise<void>
} {
  const [status, setStatus] = useState<GitHubStatus | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    window.pilog.invoke('github:status').then(setStatus)
  }, [])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const result = await window.pilog.invoke('github:connect')
      setStatus(result)
    } catch {
      setStatus({ connected: false })
    } finally {
      setConnecting(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    await window.pilog.invoke('github:signOut')
    setStatus({ connected: false })
  }, [])

  return { status, connecting, connect, signOut }
}

export function Settings({ onBack }: { onBack: () => void }): React.JSX.Element {
  const [hotkey, setHotkey] = useSetting('hotkey.scratchpad')
  const [openAtLogin, setOpenAtLogin] = useSetting('openInboxAtLogin')
  const [hotkeyDraft, setHotkeyDraft] = useState<string | null>(null)
  const [userEdited, setUserEdited] = useState(false)
  const github = useGitHubStatus()

  const displayValue = userEdited ? (hotkeyDraft ?? '') : (hotkey ?? '')
  const dirty = userEdited && hotkeyDraft !== (hotkey ?? '')

  const handleHotkeyChange = (value: string): void => {
    setUserEdited(true)
    setHotkeyDraft(value)
  }

  const handleSaveHotkey = async (): Promise<void> => {
    if (hotkeyDraft !== null) {
      await setHotkey(hotkeyDraft)
      setUserEdited(false)
    }
  }

  const handleToggleOpenAtLogin = async (): Promise<void> => {
    const next = openAtLogin === 'true' ? 'false' : 'true'
    await setOpenAtLogin(next)
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
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">GitHub</h2>
            <p className="text-xs text-muted-foreground">
              Connect your GitHub account to create issues from PiLog.
            </p>
            {github.status?.connected ? (
              <div className="flex items-center justify-between rounded-md border px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                    {github.status.login?.charAt(0).toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{github.status.login}</p>
                    <p className="text-xs text-muted-foreground">Connected</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={github.signOut}>
                  Sign out
                </Button>
              </div>
            ) : (
              <Button onClick={github.connect} disabled={github.connecting} size="sm">
                {github.connecting ? 'Connecting…' : 'Connect GitHub'}
              </Button>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">Global Hotkey</h2>
            <p className="text-xs text-muted-foreground">
              Keyboard shortcut to open the scratchpad from anywhere.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                aria-label="Scratchpad hotkey"
                value={displayValue}
                onChange={(e) => handleHotkeyChange(e.target.value)}
                placeholder="CommandOrControl+Alt+N"
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button onClick={handleSaveHotkey} disabled={!dirty} size="sm">
                Save
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Takes effect after restarting PiLog.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">Startup</h2>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                aria-label="Open inbox at login"
                checked={openAtLogin === 'true'}
                onChange={handleToggleOpenAtLogin}
                className="h-4 w-4 rounded border-muted-foreground accent-foreground"
              />
              <span className="text-sm">Open inbox window at login</span>
            </label>
            <p className="text-xs text-muted-foreground">
              When disabled, PiLog starts in the system tray only.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
