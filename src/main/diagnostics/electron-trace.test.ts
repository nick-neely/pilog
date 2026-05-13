import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElectronTraceDiagnostic, resolveElectronTraceConfig } from './electron-trace'

describe('Electron trace diagnostic mode', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stays disabled unless an explicit diagnostic opt-in is present', () => {
    expect(
      resolveElectronTraceConfig({
        env: {},
        argv: ['pilog'],
        defaultOutputDirectory: '/tmp/pilog-traces'
      })
    ).toEqual({ enabled: false })
  })

  it('starts and stops content tracing when enabled by environment', async () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'pilog-trace-test-'))
    tempDirs.push(outputDirectory)
    const startRecording = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const stopRecording = vi
      .fn<(resultFilePath?: string) => Promise<string>>()
      .mockImplementation(async (resultFilePath) => resultFilePath ?? '')
    const info = vi.fn()

    const diagnostic = createElectronTraceDiagnostic({
      env: { PILOG_ELECTRON_TRACE: '1', PILOG_ELECTRON_TRACE_DIR: outputDirectory },
      argv: ['pilog'],
      defaultOutputDirectory: join(outputDirectory, 'default'),
      contentTracing: { startRecording, stopRecording },
      log: { info, error: vi.fn() }
    })

    expect(diagnostic.enabled).toBe(true)
    await diagnostic.start()
    const tracePath = await diagnostic.stop('test-complete')

    expect(startRecording).toHaveBeenCalledWith(
      expect.objectContaining({
        included_categories: expect.arrayContaining(['electron', 'v8', 'node', 'toplevel'])
      })
    )
    expect(stopRecording).toHaveBeenCalledWith(expect.stringMatching(/electron-trace-.*\.json$/))
    expect(tracePath).toContain(outputDirectory)
    expect(info).toHaveBeenCalledWith(
      'Electron trace diagnostic enabled',
      expect.objectContaining({ outputDirectory })
    )
    expect(info).toHaveBeenCalledWith(
      'Electron trace diagnostic written',
      expect.objectContaining({
        reason: 'test-complete',
        inspect: 'Open the file in chrome://tracing or https://ui.perfetto.dev'
      })
    )
  })

  it('accepts an explicit launch flag with an output directory and bounded duration', () => {
    const config = resolveElectronTraceConfig({
      env: { PILOG_ELECTRON_TRACE_DURATION_MS: '2500' },
      argv: ['pilog', '--pilog-trace=/tmp/custom-traces'],
      defaultOutputDirectory: '/tmp/default-traces'
    })

    expect(config).toMatchObject({
      enabled: true,
      outputDirectory: '/tmp/custom-traces',
      durationMs: 2500
    })
  })

  it('does not throw when an enabled trace cannot start', async () => {
    const outputDirectory = mkdtempSync(join(tmpdir(), 'pilog-trace-start-fail-test-'))
    tempDirs.push(outputDirectory)
    const error = vi.fn()

    const diagnostic = createElectronTraceDiagnostic({
      env: { PILOG_ELECTRON_TRACE: '1', PILOG_ELECTRON_TRACE_DIR: outputDirectory },
      argv: ['pilog'],
      defaultOutputDirectory: join(outputDirectory, 'default'),
      contentTracing: {
        startRecording: vi.fn<() => Promise<void>>().mockRejectedValue(new Error('trace denied')),
        stopRecording: vi.fn<(resultFilePath?: string) => Promise<string>>()
      },
      log: { info: vi.fn(), error }
    })

    await expect(diagnostic.start()).resolves.toBeUndefined()
    await expect(diagnostic.stop('test-complete')).resolves.toBeNull()
    expect(error).toHaveBeenCalledWith(
      'Electron trace diagnostic failed to start',
      expect.objectContaining({ error: 'trace denied' })
    )
  })
})
