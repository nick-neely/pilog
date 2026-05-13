import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

type TraceConfig = {
  included_categories: string[]
  excluded_categories?: string[]
}

type ContentTracingApi = {
  startRecording: (options: TraceConfig) => Promise<void>
  stopRecording: (resultFilePath?: string) => Promise<string>
}

type TraceLogger = {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

type ResolveElectronTraceConfigInput = {
  env: NodeJS.ProcessEnv
  argv: string[]
  defaultOutputDirectory: string
}

type DisabledTraceConfig = {
  enabled: false
}

type EnabledTraceConfig = {
  enabled: true
  outputDirectory: string
  durationMs: number | null
  traceConfig: TraceConfig
}

export type ElectronTraceConfig = DisabledTraceConfig | EnabledTraceConfig

export type ElectronTraceDiagnostic = {
  enabled: boolean
  start: () => Promise<void>
  stop: (reason: string) => Promise<string | null>
}

type CreateElectronTraceDiagnosticInput = ResolveElectronTraceConfigInput & {
  contentTracing: ContentTracingApi
  log: TraceLogger
}

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on'])
const DEFAULT_TRACE_CATEGORIES = [
  'electron',
  'v8',
  'node',
  'blink',
  'cc',
  'gpu',
  'loading',
  'startup',
  'toplevel',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.frame',
  'disabled-by-default-v8.cpu_profiler'
]

export function resolveElectronTraceConfig(
  input: ResolveElectronTraceConfigInput
): ElectronTraceConfig {
  const traceFlag = input.argv.find(
    (arg) => arg === '--pilog-trace' || arg.startsWith('--pilog-trace=')
  )
  const envEnabled = isEnabled(input.env.PILOG_ELECTRON_TRACE)
  const flagEnabled = Boolean(traceFlag)

  if (!envEnabled && !flagEnabled) {
    return { enabled: false }
  }

  const flagOutputDirectory = traceFlag?.startsWith('--pilog-trace=')
    ? traceFlag.slice('--pilog-trace='.length).trim()
    : ''
  const outputDirectory =
    input.env.PILOG_ELECTRON_TRACE_DIR?.trim() ||
    flagOutputDirectory ||
    input.defaultOutputDirectory
  const durationMs = parseDuration(input.env.PILOG_ELECTRON_TRACE_DURATION_MS)

  return {
    enabled: true,
    outputDirectory: resolve(outputDirectory),
    durationMs,
    traceConfig: {
      included_categories: DEFAULT_TRACE_CATEGORIES,
      excluded_categories: ['disabled-by-default-netlog']
    }
  }
}

export function createElectronTraceDiagnostic(
  input: CreateElectronTraceDiagnosticInput
): ElectronTraceDiagnostic {
  const config = resolveElectronTraceConfig(input)
  let started = false
  let stopped = false
  let stopTimer: NodeJS.Timeout | null = null

  if (!config.enabled) {
    return {
      enabled: false,
      start: async () => undefined,
      stop: async () => null
    }
  }
  const enabledConfig = config

  async function start(): Promise<void> {
    if (started || stopped) return

    mkdirSync(enabledConfig.outputDirectory, { recursive: true })
    input.log.info('Electron trace diagnostic enabled', {
      outputDirectory: enabledConfig.outputDirectory,
      durationMs: enabledConfig.durationMs,
      categories: enabledConfig.traceConfig.included_categories
    })
    try {
      await input.contentTracing.startRecording(enabledConfig.traceConfig)
      started = true
    } catch (error) {
      stopped = true
      input.log.error('Electron trace diagnostic failed to start', {
        error: error instanceof Error ? error.message : String(error)
      })
      return
    }

    if (enabledConfig.durationMs !== null) {
      stopTimer = setTimeout(() => {
        void stop('duration-elapsed')
      }, enabledConfig.durationMs)
      stopTimer.unref()
    }
  }

  async function stop(reason: string): Promise<string | null> {
    if (!started || stopped) return null

    stopped = true
    if (stopTimer) {
      clearTimeout(stopTimer)
      stopTimer = null
    }

    const tracePath = join(enabledConfig.outputDirectory, createTraceFilename())

    try {
      const writtenPath = await input.contentTracing.stopRecording(tracePath)
      input.log.info('Electron trace diagnostic written', {
        path: writtenPath,
        reason,
        inspect: 'Open the file in chrome://tracing or https://ui.perfetto.dev'
      })
      return writtenPath
    } catch (error) {
      input.log.error('Electron trace diagnostic failed to stop', {
        reason,
        error: error instanceof Error ? error.message : String(error)
      })
      return null
    }
  }

  return {
    enabled: true,
    start,
    stop
  }
}

function isEnabled(value: string | undefined): boolean {
  return value !== undefined && ENABLED_VALUES.has(value.trim().toLowerCase())
}

function parseDuration(value: string | undefined): number | null {
  if (!value) return null

  const durationMs = Number(value)
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null

  return Math.round(durationMs)
}

function createTraceFilename(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `electron-trace-${timestamp}-${process.pid}.json`
}
