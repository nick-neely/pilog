import { useCallback, useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckmarkCircle01Icon,
  DatabaseImportIcon,
  Delete02Icon,
  EyeIcon,
  FileKeyIcon,
  Search01Icon
} from '@hugeicons/core-free-icons'
import { Avatar, AvatarFallback } from '@renderer/components/ui/avatar'
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
import { Button } from '@renderer/components/ui/button'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Switch } from '@renderer/components/ui/switch'
import type {
  GitHubStatus,
  AdvancedSettings,
  PiActiveConfig,
  PiModelOption,
  PiProviderOption,
  SearchProvider,
  SettingKey
} from '@shared/ipc'
import {
  DEFAULT_TURN_BUDGET,
  MAX_TURN_BUDGET,
  MIN_TURN_BUDGET,
  SEARCH_PROVIDERS,
  isSearchProvider
} from '@shared/types'

const SEARCH_PROVIDER_LABELS: Record<SearchProvider, string> = {
  brave: 'Brave',
  tavily: 'Tavily'
}
const TURN_BUDGET_ERROR = `Enter a whole number from ${MIN_TURN_BUDGET} to ${MAX_TURN_BUDGET}.`
const TURN_BUDGET_HELP = `Generation stops if a run passes this many turns. Default is ${DEFAULT_TURN_BUDGET}.`

type PiConfigState = {
  active: PiActiveConfig | null
  providers: PiProviderOption[]
  models: PiModelOption[]
  selectedProvider: string
  selectedModel: string
  apiKey: string
  saving: boolean
  setSelectedProvider: (provider: string) => void
  setSelectedModel: (model: string) => void
  setApiKey: (apiKey: string) => void
  save: () => Promise<void>
  importExisting: () => Promise<void>
  reset: () => Promise<void>
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

function usePiConfig(): PiConfigState {
  const [active, setActive] = useState<PiActiveConfig | null>(null)
  const [providers, setProviders] = useState<PiProviderOption[]>([])
  const [models, setModels] = useState<PiModelOption[]>([])
  const [selectedProvider, setSelectedProviderState] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const modelFetchIdRef = useRef(0)
  const mountedRef = useRef(false)

  const refresh = useCallback(async () => {
    const [nextActive, nextProviders] = await Promise.all([
      window.pilog.invoke('pi:getActiveConfig'),
      window.pilog.invoke('pi:listProviders')
    ])
    if (!mountedRef.current) return
    setActive(nextActive)
    setProviders(nextProviders)
    setSelectedProviderState(nextActive.provider ?? nextProviders[0]?.id ?? '')
  }, [])

  useEffect(() => {
    mountedRef.current = true

    refresh().catch(() => {
      if (mountedRef.current) setProviders([])
    })

    return () => {
      mountedRef.current = false
      modelFetchIdRef.current += 1
    }
  }, [refresh])

  useEffect(() => {
    const fetchId = ++modelFetchIdRef.current

    window.pilog
      .invoke('pi:listModels', selectedProvider ? { provider: selectedProvider } : undefined)
      .then((nextModels) => {
        if (fetchId !== modelFetchIdRef.current) return
        setModels(nextModels)
        setSelectedModel((current) => {
          return getPreferredModelId({
            current,
            activeProvider: active?.provider ?? null,
            activeModelId: active?.modelId ?? null,
            models: nextModels,
            selectedProvider
          })
        })
      })
  }, [active?.modelId, active?.provider, selectedProvider])

  const setSelectedProvider = useCallback((provider: string) => {
    setSelectedProviderState(provider)
    setSelectedModel('')
  }, [])

  const save = useCallback(async () => {
    if (!selectedProvider || !selectedModel) return
    setSaving(true)
    try {
      const next = await window.pilog.invoke('pi:setActiveConfig', {
        provider: selectedProvider,
        modelId: selectedModel,
        apiKey
      })
      setActive(next)
      setApiKey('')
      await refresh()
    } finally {
      setSaving(false)
    }
  }, [apiKey, refresh, selectedModel, selectedProvider])

  const importExisting = useCallback(async () => {
    await window.pilog.invoke('pi:importExistingPiConfig')
    await refresh()
  }, [refresh])

  const reset = useCallback(async () => {
    await window.pilog.invoke('pi:resetConfig')
    setApiKey('')
    await refresh()
  }, [refresh])

  return {
    active,
    providers,
    models,
    selectedProvider,
    selectedModel,
    apiKey,
    saving,
    setSelectedProvider,
    setSelectedModel,
    setApiKey,
    save,
    importExisting,
    reset
  }
}

function useAdvancedSettings(): AdvancedSettingsState {
  const [settings, setSettings] = useState<AdvancedSettings | null>(null)
  const [turnBudgetDraft, setTurnBudgetDraftState] = useState('20')
  const [turnBudgetError, setTurnBudgetError] = useState<string | null>(null)
  const [webSearchApiKey, setWebSearchApiKey] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const mountedRef = useRef(false)

  const refresh = useCallback(async () => {
    const next = await window.pilog.invoke('settings:getAdvanced')
    if (!mountedRef.current) return
    setSettings(next)
    setTurnBudgetDraftState(String(next.turnBudget))
    setTurnBudgetError(null)
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

function getPreferredModelId({
  current,
  activeProvider,
  activeModelId,
  models,
  selectedProvider
}: {
  current: string
  activeProvider: string | null
  activeModelId: string | null
  models: PiModelOption[]
  selectedProvider: string
}): string {
  if (current && models.some((model) => model.id === current)) return current
  if (activeProvider === selectedProvider && activeModelId) return activeModelId
  return models[0]?.id ?? ''
}

function getPiSaveLabel(pi: Pick<PiConfigState, 'active' | 'saving'>): string {
  if (pi.saving) return 'Saving'
  if (pi.active?.valid) return 'Change…'
  return 'Configure Pi'
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
  const pi = usePiConfig()
  const advanced = useAdvancedSettings()

  const displayValue = userEdited ? (hotkeyDraft ?? '') : (hotkey ?? '')
  const dirty = userEdited && hotkeyDraft !== (hotkey ?? '')
  const piApiKeyPlaceholder = pi.active?.hasApiKey
    ? 'API key stored. Paste a new key to replace it.'
    : 'Paste API key'
  const piCredentialStatus = pi.active?.hasApiKey ? 'stored' : 'not stored'
  const piSaveLabel = getPiSaveLabel(pi)
  const advancedSettings = advanced.settings
  const turnBudgetDirty =
    advancedSettings !== null && advanced.turnBudgetDraft !== String(advancedSettings.turnBudget)
  const searchKeyPlaceholder = advancedSettings?.webSearchHasApiKey
    ? 'API key stored. Paste a new key to replace it.'
    : 'Paste search API key'

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

          <section className="flex flex-col gap-3" data-testid="pi-config-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-foreground">Provider &amp; Model</h2>
                <p className="mt-1 max-w-[68ch] text-xs text-muted-foreground">
                  Choose the Pi model used for draft generation. Provider credentials are stored in
                  OS-backed safe storage, separate from PiLog settings.
                </p>
              </div>
              {pi.active?.valid && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} aria-hidden className="size-3.5" />
                  Configured
                </span>
              )}
            </div>

            {!pi.active?.valid && (
              <div className="rounded-md border bg-muted/45 p-3">
                <p className="text-sm font-medium">Configure Pi</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select a provider, choose a model, then paste an API key to enable Generate
                  Drafts.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pi-provider">Active Provider</Label>
                <Select
                  value={pi.selectedProvider}
                  onValueChange={pi.setSelectedProvider}
                  disabled={pi.providers.length === 0}
                >
                  <SelectTrigger id="pi-provider" data-testid="pi-provider-select">
                    <SelectValue placeholder="Choose provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {pi.providers.map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pi-model">Active Model</Label>
                <Select
                  value={pi.selectedModel}
                  onValueChange={pi.setSelectedModel}
                  disabled={pi.models.length === 0}
                >
                  <SelectTrigger id="pi-model" data-testid="pi-model-select">
                    <SelectValue placeholder="Choose model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {pi.models.map((model) => (
                        <SelectItem key={`${model.provider}:${model.id}`} value={model.id}>
                          {model.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pi-api-key">Credential</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="pi-api-key"
                  data-testid="pi-api-key-input"
                  type="password"
                  value={pi.apiKey}
                  onChange={(event) => pi.setApiKey(event.target.value)}
                  placeholder={piApiKeyPlaceholder}
                  className="flex-1 font-mono"
                />
                <Button
                  size="sm"
                  onClick={() => void pi.save()}
                  disabled={!pi.selectedProvider || !pi.selectedModel || pi.saving}
                  data-testid="pi-save-config"
                >
                  <HugeiconsIcon icon={FileKeyIcon} data-icon="inline-start" aria-hidden />
                  {piSaveLabel}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Current: {pi.active?.providerName ?? 'No provider'} ·{' '}
                {pi.active?.modelName ?? 'No model'} · key {piCredentialStatus}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => void pi.importExisting()}>
                <HugeiconsIcon icon={DatabaseImportIcon} data-icon="inline-start" aria-hidden />
                Import existing Pi config
              </Button>

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
                  <Button variant="destructive" size="sm">
                    <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" aria-hidden />
                    Reset Pi config
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Pi config?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This removes PiLog&apos;s stored Pi credentials and clears the active provider
                      and model. Your standalone Pi config is left untouched.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void pi.reset()}>
                      Reset
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>

          <section className="flex flex-col gap-3" data-testid="advanced-settings-panel">
            <div>
              <h2 className="text-sm font-medium text-foreground">Advanced</h2>
              <p className="mt-1 max-w-[68ch] text-xs text-muted-foreground">
                Tune draft-generation limits and opt into bounded provider search. Search keys are
                stored in OS-backed safe storage, separate from model credentials.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="turn-budget">Turn Budget</Label>
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

            <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/35 p-3">
              <div>
                <Label htmlFor="web-search-enabled" className="text-sm font-medium">
                  Web Search
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Registers a bounded search-results tool only when enabled and keyed.
                </p>
              </div>
              <Switch
                id="web-search-enabled"
                data-testid="web-search-toggle"
                checked={advancedSettings?.webSearchEnabled ?? false}
                onCheckedChange={(enabled) => void advanced.setWebSearchEnabled(enabled)}
                aria-label="Enable Web Search"
              />
            </div>

            {advancedSettings?.webSearchEnabled && (
              <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="web-search-provider">Search Provider</Label>
                  <Select
                    value={advancedSettings.webSearchProvider}
                    onValueChange={(provider) => {
                      if (isSearchProvider(provider)) {
                        void advanced.setWebSearchProvider(provider)
                      }
                    }}
                  >
                    <SelectTrigger id="web-search-provider" data-testid="web-search-provider">
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
                  <Label htmlFor="web-search-api-key">Search Credential</Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="web-search-api-key"
                      data-testid="web-search-api-key"
                      type="password"
                      value={advanced.webSearchApiKey}
                      onChange={(event) => advanced.setWebSearchApiKey(event.target.value)}
                      placeholder={searchKeyPlaceholder}
                      className="flex-1 font-mono"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void advanced.saveWebSearchApiKey()}
                      disabled={!advanced.webSearchApiKey.trim() || advanced.savingKey}
                    >
                      <HugeiconsIcon icon={Search01Icon} data-icon="inline-start" aria-hidden />
                      {advanced.savingKey ? 'Saving' : 'Save'}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Current: {advancedSettings.webSearchProvider} · key{' '}
                    {advancedSettings.webSearchHasApiKey ? 'stored' : 'not stored'}
                  </p>
                </div>
              </div>
            )}
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
