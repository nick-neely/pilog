import type { PiActiveConfig, PiModelOption, PiProviderOption } from '@shared/ipc'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getErrorMessage } from '../recovery-state'

export type PiConfigState = {
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
  save: () => Promise<PiActiveConfig | null>
  importExisting: () => Promise<PiActiveConfig | null>
  reset: () => Promise<PiActiveConfig | null>
  error: string | null
  retry: () => Promise<void>
}

export function usePiConfig(): PiConfigState {
  const [active, setActive] = useState<PiActiveConfig | null>(null)
  const [providers, setProviders] = useState<PiProviderOption[]>([])
  const [models, setModels] = useState<PiModelOption[]>([])
  const [selectedProvider, setSelectedProviderState] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modelFetchIdRef = useRef(0)
  const mountedRef = useRef(false)

  const refresh = useCallback((): Promise<void> => {
    if (!mountedRef.current) return Promise.resolve()
    setError(null)
    return Promise.all([
      window.pilog.invoke('pi:getActiveConfig'),
      window.pilog.invoke('pi:listProviders')
    ])
      .then(([nextActive, nextProviders]) => {
        if (!mountedRef.current) return
        setActive(nextActive)
        setProviders(nextProviders)
        setSelectedProviderState(nextActive.provider ?? nextProviders[0]?.id ?? '')
      })
      .catch((err) => {
        if (!mountedRef.current) return
        setProviders([])
        setError(getErrorMessage(err, 'Pi configuration could not be loaded.'))
      })
  }, [])

  useEffect(() => {
    mountedRef.current = true

    void refresh()

    return () => {
      mountedRef.current = false
      modelFetchIdRef.current += 1
    }
  }, [refresh])

  useEffect(() => {
    const fetchId = ++modelFetchIdRef.current

    if (!selectedProvider && providers.length === 0) {
      void Promise.resolve().then(() => {
        if (fetchId === modelFetchIdRef.current) setModels([])
      })
      return
    }

    window.pilog
      .invoke('pi:listModels', selectedProvider ? { provider: selectedProvider } : undefined)
      .then((nextModels) => {
        if (fetchId !== modelFetchIdRef.current) return
        setError(null)
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
      .catch((err) => {
        if (fetchId !== modelFetchIdRef.current) return
        setModels([])
        setError(getErrorMessage(err, 'Pi models could not be loaded.'))
      })
  }, [active?.modelId, active?.provider, providers.length, selectedProvider])

  const setSelectedProvider = useCallback((provider: string) => {
    setSelectedProviderState(provider)
    setSelectedModel('')
  }, [])

  const save = useCallback(async (): Promise<PiActiveConfig | null> => {
    if (!selectedProvider || !selectedModel) return null
    setSaving(true)
    try {
      setError(null)
      const next = await window.pilog.invoke('pi:setActiveConfig', {
        provider: selectedProvider,
        modelId: selectedModel,
        apiKey
      })
      setActive(next)
      setApiKey('')
      await refresh()
      return next
    } catch (err) {
      setError(getErrorMessage(err, 'Pi configuration could not be saved.'))
      return null
    } finally {
      setSaving(false)
    }
  }, [apiKey, refresh, selectedModel, selectedProvider])

  const importExisting = useCallback(async (): Promise<PiActiveConfig | null> => {
    try {
      setError(null)
      const next = await window.pilog.invoke('pi:importExistingPiConfig')
      await refresh()
      return next
    } catch (err) {
      setError(getErrorMessage(err, 'Existing Pi config could not be imported.'))
      return null
    }
  }, [refresh])

  const reset = useCallback(async (): Promise<PiActiveConfig | null> => {
    try {
      setError(null)
      const next = await window.pilog.invoke('pi:resetConfig')
      setApiKey('')
      await refresh()
      return next
    } catch (err) {
      setError(getErrorMessage(err, 'Pi config could not be reset.'))
      return null
    }
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
    reset,
    error,
    retry: refresh
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
