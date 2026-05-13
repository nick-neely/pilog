import {
  CheckmarkCircle01Icon,
  DatabaseImportIcon,
  FileKeyIcon,
  InformationCircleIcon
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from '@renderer/components/ui/combobox'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Separator } from '@renderer/components/ui/separator'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@renderer/components/ui/hover-card'
import { GENERATION_EGRESS_DISCLOSURE } from '@shared/data-boundaries'
import { useMemo } from 'react'
import { getPiSetupRecoveryState } from '../recovery-state'
import type { PiConfigState } from './use-pi-config'

type ComboItem = { value: string; label: string }

function comboItemsEqual(a: ComboItem, b: ComboItem): boolean {
  return a.value === b.value
}

function getPiSaveLabel(pi: Pick<PiConfigState, 'active' | 'saving'>): string {
  if (pi.saving) return 'Saving'
  if (pi.active?.valid) return 'Change...'
  return 'Configure Pi'
}

export function PiSetupPanel({
  pi,
  description = 'Choose the Pi model used for draft generation. Credentials are stored in OS-backed safe storage, separate from Pilog settings.',
  onConfigured,
  children
}: {
  pi: PiConfigState
  description?: string
  onConfigured?: () => void
  children?: React.ReactNode
}): React.JSX.Element {
  const piApiKeyPlaceholder = pi.active?.hasApiKey
    ? 'API key stored. Paste a new key to replace it.'
    : 'Paste API key'
  const piCredentialStatus = pi.active?.hasApiKey ? 'stored' : 'not stored'
  const piSaveLabel = getPiSaveLabel(pi)
  const piRecovery = getPiSetupRecoveryState({
    error: pi.error,
    hasProviders: pi.providers.length > 0
  })

  const providerItems = useMemo<ComboItem[]>(
    () => pi.providers.map((provider) => ({ value: provider.id, label: provider.name })),
    [pi.providers]
  )
  const modelItems = useMemo<ComboItem[]>(
    () => pi.models.map((model) => ({ value: model.id, label: model.name })),
    [pi.models]
  )
  const selectedProviderItem =
    providerItems.find((item) => item.value === pi.selectedProvider) ?? null
  const selectedModelItem = modelItems.find((item) => item.value === pi.selectedModel) ?? null

  const handleSave = async (): Promise<void> => {
    const next = await pi.save()
    if (next?.valid) onConfigured?.()
  }

  const handleImportExisting = async (): Promise<void> => {
    const next = await pi.importExisting()
    if (next?.valid) onConfigured?.()
  }

  return (
    <section className="flex flex-col gap-4" data-testid="pi-config-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Provider &amp; Model</h2>
          <p className="mt-1 max-w-[68ch] text-xs text-muted-foreground">{description}</p>
        </div>
        {pi.active?.valid && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
            <HugeiconsIcon icon={CheckmarkCircle01Icon} aria-hidden />
            Configured
          </span>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pi-provider">Active provider</Label>
          <Combobox
            items={providerItems}
            value={selectedProviderItem}
            onValueChange={(item) =>
              pi.setSelectedProvider((item as ComboItem | null)?.value ?? '')
            }
            isItemEqualToValue={comboItemsEqual}
          >
            <ComboboxInput
              id="pi-provider"
              data-testid="pi-provider-select"
              placeholder={pi.providers.length === 0 ? 'Loading providers...' : 'Choose provider'}
              disabled={pi.providers.length === 0}
            />
            <ComboboxContent>
              <ComboboxList>
                {(item: ComboItem) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
              <ComboboxEmpty>No matching providers</ComboboxEmpty>
            </ComboboxContent>
          </Combobox>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pi-model">Active model</Label>
          <Combobox
            items={modelItems}
            value={selectedModelItem}
            onValueChange={(item) => pi.setSelectedModel((item as ComboItem | null)?.value ?? '')}
            isItemEqualToValue={comboItemsEqual}
          >
            <ComboboxInput
              id="pi-model"
              data-testid="pi-model-select"
              placeholder={pi.models.length === 0 ? 'Loading models...' : 'Search models...'}
              disabled={pi.models.length === 0}
            />
            <ComboboxContent>
              <ComboboxList>
                {(item: ComboItem) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
              <ComboboxEmpty>No matching models</ComboboxEmpty>
            </ComboboxContent>
          </Combobox>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pi-api-key">API key</Label>
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
            onClick={() => void handleSave()}
            disabled={!pi.selectedProvider || !pi.selectedModel || pi.saving}
            data-testid="pi-save-config"
          >
            <HugeiconsIcon icon={FileKeyIcon} data-icon="inline-start" aria-hidden />
            {piSaveLabel}
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            Current: {pi.active?.providerName ?? 'No provider'} ·{' '}
            {pi.active?.modelName ?? 'No model'} · key {piCredentialStatus}
          </span>
          <HoverCard>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Data sharing information"
              >
                <HugeiconsIcon icon={InformationCircleIcon} className="size-4" aria-hidden />
              </button>
            </HoverCardTrigger>
            <HoverCardContent side="top" className="w-80 rounded-xl">
              <div className="space-y-2">
                <p className="text-sm font-medium">Data sharing</p>
                <Separator />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {GENERATION_EGRESS_DISCLOSURE}
                </p>
              </div>
            </HoverCardContent>
          </HoverCard>
        </div>
      </div>

      {piRecovery ? (
        <Alert variant="destructive" className="rounded-md">
          <AlertTitle>{piRecovery.title}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{piRecovery.description}</span>
            <span className="font-mono text-xs">{pi.error}</span>
            <span>
              <Button type="button" variant="outline" size="sm" onClick={() => void pi.retry()}>
                {piRecovery.actionLabel}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void handleImportExisting()}>
          <HugeiconsIcon icon={DatabaseImportIcon} data-icon="inline-start" aria-hidden />
          Import existing Pi config
        </Button>
        {children}
      </div>
    </section>
  )
}
