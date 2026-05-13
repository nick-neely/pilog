import {
  Activity01Icon,
  ArrowDown01Icon,
  CheckmarkCircle01Icon,
  ComputerIcon,
  Delete02Icon,
  Download01Icon,
  EyeIcon,
  GithubIcon,
  InformationCircleIcon,
  ListRestartIcon,
  Moon02Icon,
  Refresh01Icon,
  Search01Icon,
  Sun02Icon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { HotkeyInput } from '@renderer/components/HotkeyInput'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@renderer/components/ui/alert-dialog'
import { Avatar, AvatarFallback } from '@renderer/components/ui/avatar'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@renderer/components/ui/collapsible'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Separator } from '@renderer/components/ui/separator'
import { Switch } from '@renderer/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import { isThemeMode, type AppliedTheme, type ThemeMode } from '@renderer/theme/theme-mode'
import { useTheme } from '@renderer/theme/useTheme'
import { LOCAL_FIRST_DISCLOSURE } from '@shared/data-boundaries'
import type {
  AdvancedSettings,
  AppUpdateStatus,
  GitHubAuthProgress,
  RuntimeReadiness,
  RuntimeReadinessItem,
  SearchProvider,
  SettingKey
} from '@shared/ipc'
import { DEFAULT_GLOBAL_CAPTURE_SHORTCUT } from '@shared/shortcuts'
import {
  DEFAULT_TURN_BUDGET,
  MAX_TURN_BUDGET,
  MIN_TURN_BUDGET,
  SEARCH_PROVIDERS,
  isSearchProvider
} from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GitHubDeviceCode } from '../setup/GitHubDeviceCode'
import { PiSetupPanel } from '../setup/PiSetupPanel'
import { useGitHubStatus } from '../setup/use-github-status'
import { usePiConfig } from '../setup/use-pi-config'
import { getUpdateStatusView } from './update-status-view'

const SEARCH_PROVIDER_LABELS: Record<SearchProvider, string> = {
  brave: 'Brave',
  tavily: 'Tavily'
}
const TURN_BUDGET_ERROR = `Enter a whole number from ${MIN_TURN_BUDGET} to ${MAX_TURN_BUDGET}.`
const TURN_BUDGET_HELP = `Generation stops if a run passes this many turns. Default is ${DEFAULT_TURN_BUDGET}.`
const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun02Icon },
  { value: 'dark', label: 'Dark', icon: Moon02Icon },
  { value: 'system', label: 'Auto', icon: ComputerIcon }
] as const satisfies readonly { value: ThemeMode; label: string; icon: typeof Sun02Icon }[]

function getThemeStatusMessage(mode: ThemeMode, appliedTheme: AppliedTheme): string {
  switch (mode) {
    case 'system':
      return `Auto is currently using ${appliedTheme} mode.`
    case 'dark':
      return 'Dark mode is active.'
    case 'light':
      return 'Light mode is active.'
  }
}

function githubAuthMessage(auth: GitHubAuthProgress | undefined): string | null {
  if (!auth) return null

  switch (auth.state) {
    case 'device_code':
      return 'GitHub is open in your browser. Enter this code to approve Pilog.'
    case 'polling':
      return auth.message
    case 'slow_down':
      return auth.message
    case 'authorized':
      return `Connected as ${auth.login}.`
    case 'denied':
    case 'expired':
    case 'cancelled':
    case 'network_error':
      return auth.message
  }
}

type AdvancedSettingsState = {
  settings: AdvancedSettings | null
  turnBudgetDraft: string
  turnBudgetError: string | null
  webSearchApiKey: string
  savingKey: boolean
  setTurnBudgetDraft: (value: string) => void
  saveTurnBudget: () => Promise<void>
  setWebSearchEnabled: (enabled: boolean) => Promise<void>
  setWebSearchProvider: (provider: SearchProvider) => Promise<void>
  setWebSearchApiKey: (apiKey: string) => void
  saveWebSearchApiKey: () => Promise<void>
}

type UpdateState = {
  status: AppUpdateStatus | null
  check: () => Promise<void>
  download: () => Promise<void>
  restart: () => Promise<void>
}

type RuntimeReadinessState = {
  readiness: RuntimeReadiness | null
  refresh: () => Promise<void>
}

const RUNTIME_READINESS_ITEM_ORDER = [
  'git',
  'keychain',
  'localRepositories',
  'bundledRepoTooling'
] as const satisfies readonly (keyof RuntimeReadiness['items'])[]

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

function useAdvancedSettings(): AdvancedSettingsState {
  const [settings, setSettings] = useState<AdvancedSettings | null>(null)
  const [turnBudgetDraft, setTurnBudgetDraftState] = useState('20')
  const [turnBudgetError, setTurnBudgetError] = useState<string | null>(null)
  const [webSearchApiKey, setWebSearchApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const mountedRef = useRef(false)

  const refresh = useCallback((): Promise<void> => {
    if (!mountedRef.current) return Promise.resolve()
    return window.pilog.invoke('settings:getAdvanced').then((next) => {
      if (!mountedRef.current) return
      setSettings(next)
      setTurnBudgetDraftState(String(next.turnBudget))
      setTurnBudgetError(null)
    })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refresh().catch(() => undefined)
    return () => {
      mountedRef.current = false
    }
  }, [refresh])

  const setTurnBudgetDraft = useCallback((value: string) => {
    setTurnBudgetDraftState(value)
    setTurnBudgetError(null)
  }, [])

  const saveTurnBudget = useCallback(async () => {
    const parsed = Number(turnBudgetDraft)
    if (!Number.isInteger(parsed) || parsed < MIN_TURN_BUDGET || parsed > MAX_TURN_BUDGET) {
      setTurnBudgetError(TURN_BUDGET_ERROR)
      return
    }

    const next = await window.pilog.invoke('settings:setAdvanced', { turnBudget: parsed })
    setSettings(next)
    setTurnBudgetDraftState(String(next.turnBudget))
    setTurnBudgetError(null)
  }, [turnBudgetDraft])

  const setWebSearchEnabled = useCallback(async (enabled: boolean) => {
    setSettings(await window.pilog.invoke('settings:setAdvanced', { webSearchEnabled: enabled }))
  }, [])

  const setWebSearchProvider = useCallback(async (provider: SearchProvider) => {
    setSettings(await window.pilog.invoke('settings:setAdvanced', { webSearchProvider: provider }))
  }, [])

  const saveWebSearchApiKey = useCallback(async () => {
    const apiKey = webSearchApiKey.trim()
    if (!apiKey) return
    setSavingKey(true)
    try {
      const next = await window.pilog.invoke('settings:setAdvanced', { webSearchApiKey: apiKey })
      setSettings(next)
      setWebSearchApiKey('')
    } finally {
      setSavingKey(false)
    }
  }, [webSearchApiKey])

  return {
    settings,
    turnBudgetDraft,
    turnBudgetError,
    webSearchApiKey,
    savingKey,
    setTurnBudgetDraft,
    saveTurnBudget,
    setWebSearchEnabled,
    setWebSearchProvider,
    setWebSearchApiKey,
    saveWebSearchApiKey
  }
}

function useAppUpdates(): UpdateState {
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

function useRuntimeReadiness(): RuntimeReadinessState {
  const [readiness, setReadiness] = useState<RuntimeReadiness | null>(null)

  const refresh = useCallback(async () => {
    setReadiness(await window.pilog.invoke('runtime:readiness'))
  }, [])

  useEffect(() => {
    let mounted = true
    window.pilog.invoke('runtime:readiness').then((next) => {
      if (mounted) setReadiness(next)
    })
    return () => {
      mounted = false
    }
  }, [])

  return { readiness, refresh }
}

function getRuntimeReadinessStatusLabel(status: RuntimeReadinessItem['status']): string {
  switch (status) {
    case 'ready':
      return 'Ready'
    case 'degraded':
      return 'Needs attention'
    case 'missing':
      return 'Missing'
  }
}

function RuntimeReadinessRow({ item }: { item: RuntimeReadinessItem }): React.JSX.Element {
  const ok = item.status === 'ready'

  return (
    <li className="flex gap-3 py-3">
      <HugeiconsIcon
        icon={ok ? CheckmarkCircle01Icon : InformationCircleIcon}
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-sm font-medium text-foreground">{item.label}</p>
          <Badge variant={ok ? 'secondary' : 'destructive'}>
            {getRuntimeReadinessStatusLabel(item.status)}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
        {!ok && <p className="mt-1 text-xs text-foreground">{item.recoveryAction}</p>}
      </div>
    </li>
  )
}

export function Settings({
  onBack,
  onNavigateRepositories,
  onNavigateRunHistory,
  onNavigatePublishLog
}: {
  onBack: () => void
  onNavigateRepositories?: () => void
  onNavigateRunHistory?: () => void
  onNavigatePublishLog?: () => void
}): React.JSX.Element {
  const [hotkey, setHotkey] = useSetting('hotkey.scratchpad')
  const [openAtLogin, setOpenAtLogin] = useSetting('openInboxAtLogin')
  const [hotkeyDraft, setHotkeyDraft] = useState<string | null>(null)
  const [userEdited, setUserEdited] = useState(false)
  const github = useGitHubStatus()
  const pi = usePiConfig()
  const advanced = useAdvancedSettings()
  const updates = useAppUpdates()
  const runtime = useRuntimeReadiness()
  const theme = useTheme()

  const displayValue = userEdited ? (hotkeyDraft ?? '') : (hotkey ?? '')
  const dirty = userEdited && hotkeyDraft !== (hotkey ?? '')
  const advancedSettings = advanced.settings
  const turnBudgetDirty =
    advancedSettings !== null && advanced.turnBudgetDraft !== String(advancedSettings.turnBudget)
  const searchKeyPlaceholder = advancedSettings?.webSearchHasApiKey
    ? 'API key stored. Paste a new key to replace it.'
    : 'Paste search API key'

  const advancedSummary = advancedSettings
    ? `Turn budget ${advancedSettings.turnBudget} · Web search ${
        advancedSettings.webSearchEnabled
          ? `on (${SEARCH_PROVIDER_LABELS[advancedSettings.webSearchProvider]})`
          : 'off'
      }`
    : 'Loading…'
  const updateView = getUpdateStatusView(updates.status)
  const runtimeReadiness = runtime.readiness

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
      <div className="flex-1">
        <ScrollArea className="h-full">
          <div className="p-6">
            <div className="mx-auto flex max-w-2xl flex-col gap-6">
              <Alert data-testid="settings-local-first-disclosure" className="rounded-md">
                <AlertTitle>Local records</AlertTitle>
                <AlertDescription>{LOCAL_FIRST_DISCLOSURE}</AlertDescription>
              </Alert>
              <Tabs defaultValue="general" className="flex flex-col gap-6">
                <TabsList
                  variant="line"
                  className="h-auto min-h-9 w-full min-w-0 flex-wrap justify-start gap-1 sm:flex-nowrap"
                  aria-label="Settings categories"
                >
                  <TabsTrigger value="general">General</TabsTrigger>
                  <TabsTrigger value="github">GitHub</TabsTrigger>
                  <TabsTrigger value="agent">Drafts &amp; search</TabsTrigger>
                </TabsList>

                <TabsContent
                  value="general"
                  className="mt-0 flex flex-col gap-8 focus-visible:outline-none"
                  tabIndex={-1}
                >
                  <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-medium text-foreground">Global Hotkey</h2>
                    <p className="text-xs text-muted-foreground">
                      Keyboard shortcut to open the scratchpad from anywhere.
                    </p>
                    <div className="flex items-center gap-3">
                      <HotkeyInput
                        aria-label="Scratchpad hotkey"
                        value={displayValue}
                        onHotkeyChange={handleHotkeyChange}
                        placeholder={DEFAULT_GLOBAL_CAPTURE_SHORTCUT}
                        className="flex-1 font-mono"
                      />
                      <Button onClick={handleSaveHotkey} disabled={!dirty} size="sm">
                        Save
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Press the keys you want, then save. If the shortcut is already taken by
                      another app, Pilog will keep listening for the previous one.
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
                      <Label
                        htmlFor="open-inbox-at-login"
                        className="cursor-pointer text-sm font-normal"
                      >
                        Open inbox window at login
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When disabled, Pilog starts in the system tray only.
                    </p>
                  </section>

                  <section className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <h2 className="text-sm font-medium text-foreground">Appearance</h2>
                      <p className="text-xs text-muted-foreground">
                        Match your system, or keep Pilog pinned to one theme.
                      </p>
                    </div>
                    <ToggleGroup
                      type="single"
                      variant="outline"
                      size="sm"
                      value={theme.mode}
                      onValueChange={(value) => {
                        if (isThemeMode(value)) theme.setMode(value)
                      }}
                      aria-label="Theme"
                      className="w-full max-w-md"
                    >
                      {THEME_OPTIONS.map((option) => (
                        <ToggleGroupItem
                          key={option.value}
                          value={option.value}
                          aria-label={`${option.label} theme`}
                          className="min-w-0 flex-1"
                        >
                          <HugeiconsIcon icon={option.icon} data-icon="inline-start" aria-hidden />
                          {option.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {getThemeStatusMessage(theme.mode, theme.appliedTheme)}
                    </p>
                  </section>

                  <section aria-live="polite" data-testid="runtime-readiness-section">
                    <Card size="sm" className="shadow-none ring-1 ring-border">
                      <CardHeader className="gap-2 pb-2">
                        <CardTitle>Runtime prerequisites</CardTitle>
                        <CardAction>
                          {runtimeReadiness ? (
                            <Badge variant={runtimeReadiness.ready ? 'secondary' : 'destructive'}>
                              {runtimeReadiness.ready ? 'Ready' : 'Needs attention'}
                            </Badge>
                          ) : null}
                        </CardAction>
                        <CardDescription>
                          Git, secure storage, linked folders, and bundled repo tools.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {runtimeReadiness ? (
                          <ul className="divide-y divide-border/60">
                            {RUNTIME_READINESS_ITEM_ORDER.map((key) => (
                              <RuntimeReadinessRow key={key} item={runtimeReadiness.items[key]} />
                            ))}
                          </ul>
                        ) : (
                          <p className="py-3 text-sm text-muted-foreground">
                            Checking runtime prerequisites.
                          </p>
                        )}
                      </CardContent>
                      <CardFooter className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void runtime.refresh()}
                        >
                          <HugeiconsIcon
                            icon={Refresh01Icon}
                            data-icon="inline-start"
                            aria-hidden
                          />
                          Refresh
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Used before repo linking and draft generation.
                        </p>
                      </CardFooter>
                    </Card>
                  </section>

                  <section aria-live="polite" data-testid="settings-updates-section">
                    <Card
                      size="sm"
                      data-testid="settings-updates-card"
                      className="shadow-none ring-1 ring-border"
                    >
                      <CardHeader className="gap-2 pb-4">
                        <CardTitle>Software updates</CardTitle>
                        <CardAction>
                          {updates.status ? (
                            <Badge variant="secondary">{updates.status.channelLabel}</Badge>
                          ) : null}
                        </CardAction>
                        <CardDescription>{updateView.title}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3 pt-0">
                        {updates.status?.state === 'error' ? (
                          <Alert variant="destructive" className="rounded-md">
                            <AlertTitle>Could not check for updates</AlertTitle>
                            <AlertDescription>{updateView.detail}</AlertDescription>
                          </Alert>
                        ) : (
                          <p className="text-sm text-muted-foreground">{updateView.detail}</p>
                        )}
                        {updates.status ? (
                          <p className="font-mono text-xs text-muted-foreground">
                            Installed {updates.status.version}
                            <span aria-hidden> · </span>
                            <span className="sr-only">, </span>
                            {updates.status.channelLabel} channel
                          </p>
                        ) : null}
                      </CardContent>
                      <CardFooter className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void updates.check()}
                          disabled={!updateView.canCheck || updateView.busy}
                        >
                          <HugeiconsIcon
                            icon={Refresh01Icon}
                            data-icon="inline-start"
                            aria-hidden
                          />
                          {updateView.busy ? 'Checking' : 'Check'}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void updates.download()}
                          disabled={!updateView.canDownload || updateView.busy}
                        >
                          <HugeiconsIcon
                            icon={Download01Icon}
                            data-icon="inline-start"
                            aria-hidden
                          />
                          Download
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void updates.restart()}
                          disabled={!updateView.canRestart || updateView.busy}
                        >
                          <HugeiconsIcon
                            icon={ListRestartIcon}
                            data-icon="inline-start"
                            aria-hidden
                          />
                          Restart
                        </Button>
                      </CardFooter>
                    </Card>
                  </section>
                </TabsContent>

                <TabsContent
                  value="github"
                  className="mt-0 flex flex-col gap-8 focus-visible:outline-none"
                  tabIndex={-1}
                >
                  <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-medium text-foreground">GitHub</h2>
                    <p className="text-xs text-muted-foreground">
                      Connect your GitHub account to create issues from Pilog.
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
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button onClick={github.connect} disabled={github.connecting} size="sm">
                            {github.connecting ? 'Waiting for GitHub' : 'Connect GitHub'}
                          </Button>
                          {github.connecting ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => void github.cancelConnect()}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </div>
                        {github.status?.auth ? (
                          github.status.auth.state === 'device_code' ? (
                            <GitHubDeviceCode
                              auth={github.status.auth}
                              align="start"
                              className="max-w-md"
                              message={githubAuthMessage(github.status.auth) ?? undefined}
                            />
                          ) : (
                            <div className="rounded-md border bg-muted/40 p-3" aria-live="polite">
                              <p className="text-xs text-muted-foreground">
                                {githubAuthMessage(github.status.auth)}
                              </p>
                            </div>
                          )
                        ) : null}
                      </div>
                    )}
                    {github.error ? (
                      <Alert variant="destructive" className="rounded-md">
                        <AlertTitle>GitHub connection needs attention</AlertTitle>
                        <AlertDescription className="flex flex-col gap-2">
                          <span>
                            Pilog could not confirm your GitHub connection. Try connecting again, or
                            reload the status if you already authorized access.
                          </span>
                          <span className="font-mono text-xs">{github.error}</span>
                          <span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void github.refresh()}
                            >
                              Retry GitHub status
                            </Button>
                          </span>
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </section>

                  <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-medium text-foreground">Repositories</h2>
                    <p className="text-xs text-muted-foreground">
                      Link local Git repositories to your GitHub account.
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!onNavigateRepositories}
                      onClick={() => onNavigateRepositories?.()}
                      className="justify-start self-start px-0"
                    >
                      Manage repositories &rarr;
                    </Button>
                  </section>
                </TabsContent>

                <TabsContent
                  value="agent"
                  className="mt-0 flex flex-col gap-8 focus-visible:outline-none"
                  tabIndex={-1}
                >
                  <PiSetupPanel pi={pi}>
                    <>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <HugeiconsIcon icon={EyeIcon} data-icon="inline-start" aria-hidden />
                            View active config
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Active Pi config</AlertDialogTitle>
                            <AlertDialogDescription>
                              Raw credentials are never shown in the renderer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground">
                            {JSON.stringify(
                              {
                                provider: pi.active?.provider,
                                modelId: pi.active?.modelId,
                                hasApiKey: Boolean(pi.active?.hasApiKey),
                                authMethod: pi.active?.authMethod
                              },
                              null,
                              2
                            )}
                          </pre>
                          <AlertDialogFooter>
                            <AlertDialogAction>Done</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm" className="ml-auto">
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              data-icon="inline-start"
                              aria-hidden
                            />
                            Reset Pi config
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Reset Pi config?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This removes Pilog&apos;s stored Pi credentials and clears the active
                              provider and model. Your standalone Pi config is left untouched.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => void pi.reset()}
                            >
                              Reset
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  </PiSetupPanel>

                  <Collapsible asChild data-testid="advanced-settings-panel">
                    <section className="flex flex-col gap-3">
                      <CollapsibleTrigger className="group -mx-2 flex w-[calc(100%+1rem)] items-start justify-between gap-3 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
                        <div className="min-w-0">
                          <h2 className="text-sm font-medium text-foreground">Advanced</h2>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {advancedSummary}
                          </p>
                        </div>
                        <HugeiconsIcon
                          icon={ArrowDown01Icon}
                          aria-hidden
                          className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
                        />
                      </CollapsibleTrigger>

                      <CollapsibleContent className="flex flex-col gap-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
                        <p className="max-w-[68ch] text-xs text-muted-foreground">
                          Tune draft-generation limits and opt into bounded provider search. Search
                          keys are stored in OS-backed safe storage, separate from model
                          credentials.
                        </p>

                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="turn-budget">Turn budget</Label>
                          <div className="flex items-center gap-3">
                            <Input
                              id="turn-budget"
                              data-testid="turn-budget-input"
                              inputMode="numeric"
                              type="number"
                              min={MIN_TURN_BUDGET}
                              max={MAX_TURN_BUDGET}
                              step={1}
                              value={advanced.turnBudgetDraft}
                              onChange={(event) => advanced.setTurnBudgetDraft(event.target.value)}
                              onBlur={() => void advanced.saveTurnBudget()}
                              aria-invalid={Boolean(advanced.turnBudgetError)}
                              aria-describedby={
                                advanced.turnBudgetError ? 'turn-budget-error' : 'turn-budget-help'
                              }
                              className="max-w-28 font-mono"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void advanced.saveTurnBudget()}
                              disabled={!turnBudgetDirty}
                            >
                              Save
                            </Button>
                          </div>
                          {advanced.turnBudgetError ? (
                            <p id="turn-budget-error" className="text-xs text-destructive">
                              {advanced.turnBudgetError}
                            </p>
                          ) : (
                            <p id="turn-budget-help" className="text-xs text-muted-foreground">
                              {TURN_BUDGET_HELP}
                            </p>
                          )}
                        </div>

                        <Separator />

                        <div className="flex flex-col gap-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <Label htmlFor="web-search-enabled" className="text-sm font-medium">
                                Web search
                              </Label>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Registers a bounded search-results tool only when enabled and keyed.
                              </p>
                            </div>
                            <Switch
                              id="web-search-enabled"
                              data-testid="web-search-toggle"
                              checked={advancedSettings?.webSearchEnabled ?? false}
                              onCheckedChange={(enabled) =>
                                void advanced.setWebSearchEnabled(enabled)
                              }
                              aria-label="Enable Web search"
                            />
                          </div>

                          {advancedSettings?.webSearchEnabled && (
                            <div className="grid gap-3 rounded-md bg-muted/35 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor="web-search-provider">Search provider</Label>
                                <Select
                                  value={advancedSettings.webSearchProvider}
                                  onValueChange={(provider) => {
                                    if (isSearchProvider(provider)) {
                                      void advanced.setWebSearchProvider(provider)
                                    }
                                  }}
                                >
                                  <SelectTrigger
                                    id="web-search-provider"
                                    data-testid="web-search-provider"
                                  >
                                    <SelectValue placeholder="Choose provider" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectGroup>
                                      {SEARCH_PROVIDERS.map((provider) => (
                                        <SelectItem key={provider} value={provider}>
                                          {SEARCH_PROVIDER_LABELS[provider]}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <Label htmlFor="web-search-api-key">Search API key</Label>
                                <div className="flex items-center gap-3">
                                  <Input
                                    id="web-search-api-key"
                                    data-testid="web-search-api-key"
                                    type="password"
                                    value={advanced.webSearchApiKey}
                                    onChange={(event) =>
                                      advanced.setWebSearchApiKey(event.target.value)
                                    }
                                    placeholder={searchKeyPlaceholder}
                                    className="flex-1 font-mono"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => void advanced.saveWebSearchApiKey()}
                                    disabled={
                                      !advanced.webSearchApiKey.trim() || advanced.savingKey
                                    }
                                  >
                                    <HugeiconsIcon
                                      icon={Search01Icon}
                                      data-icon="inline-start"
                                      aria-hidden
                                    />
                                    {advanced.savingKey ? 'Saving' : 'Save'}
                                  </Button>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  Current:{' '}
                                  {SEARCH_PROVIDER_LABELS[advancedSettings.webSearchProvider]} · key{' '}
                                  {advancedSettings.webSearchHasApiKey ? 'stored' : 'not stored'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {(onNavigateRunHistory || onNavigatePublishLog) && (
                          <>
                            <Separator />
                            <div className="flex flex-col gap-3">
                              <div className="flex flex-col gap-1">
                                <p className="text-sm font-medium text-foreground">Local records</p>
                                <p className="max-w-[68ch] text-xs text-muted-foreground">
                                  Read-only views of agent runs and successful GitHub publishes kept
                                  on this machine.
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {onNavigateRunHistory && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={onNavigateRunHistory}
                                  >
                                    <HugeiconsIcon
                                      icon={Activity01Icon}
                                      data-icon="inline-start"
                                      aria-hidden
                                    />
                                    Run history
                                  </Button>
                                )}
                                {onNavigatePublishLog && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={onNavigatePublishLog}
                                  >
                                    <HugeiconsIcon
                                      icon={GithubIcon}
                                      data-icon="inline-start"
                                      aria-hidden
                                    />
                                    Publish log
                                  </Button>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </CollapsibleContent>
                    </section>
                  </Collapsible>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
