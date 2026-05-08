import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar, AvatarFallback } from '@renderer/components/ui/avatar'
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
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

export function Settings({
  onBack,
  onNavigateRepositories
}: {
  onBack: () => void
  onNavigateRepositories?: () => void
}): React.JSX.Element {
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

  const handleOpenAtLoginChange = async (next: boolean): Promise<void> => {
    await setOpenAtLogin(next ? 'true' : 'false')
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onBack}>
          &larr; Back
        </Button>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-lg flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">GitHub</h2>
            <p className="text-xs text-muted-foreground">
              Connect your GitHub account to create issues from PiLog.
            </p>
            {github.status?.connected ? (
              <Card size="sm" className="shadow-none ring-1 ring-border">
                <CardContent className="flex flex-row items-center justify-between gap-4 py-0">
                  <div className="flex items-center gap-3">
                    <Avatar size="sm">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {github.status.login?.charAt(0).toUpperCase() ?? '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{github.status.login}</p>
                      <p className="text-xs text-muted-foreground">Connected</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={github.signOut}>
                    Sign out
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Button onClick={github.connect} disabled={github.connecting} size="sm">
                {github.connecting ? 'Connecting…' : 'Connect GitHub'}
              </Button>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">Repositories</h2>
            <p className="text-xs text-muted-foreground">
              Link local Git repositories to your GitHub account.
            </p>
            <Button size="sm" variant="ghost" onClick={onNavigateRepositories} className="px-0">
              Manage repositories &rarr;
            </Button>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">Global Hotkey</h2>
            <p className="text-xs text-muted-foreground">
              Keyboard shortcut to open the scratchpad from anywhere.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="text"
                aria-label="Scratchpad hotkey"
                value={displayValue}
                onChange={(e) => handleHotkeyChange(e.target.value)}
                placeholder="CommandOrControl+Alt+N"
                className="flex-1"
              />
              <Button onClick={handleSaveHotkey} disabled={!dirty} size="sm">
                Save
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Takes effect after restarting PiLog.
            </p>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-medium text-foreground">Startup</h2>
            <div className="flex items-center gap-3">
              <Switch
                id="open-inbox-at-login"
                checked={openAtLogin === 'true'}
                onCheckedChange={(c) => void handleOpenAtLoginChange(c)}
              />
              <Label htmlFor="open-inbox-at-login" className="cursor-pointer text-sm font-normal">
                Open inbox window at login
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              When disabled, PiLog starts in the system tray only.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
