import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  DEFAULT_REPORT_PATH,
  addScenario,
  createEmptyReport,
  findPackagedExecutable,
  formatSummary,
  parseArgs
} = require('./packaged-performance.cjs')

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('packaged performance runner plumbing', () => {
  it('resolves the unpacked packaged executable for the current platform', () => {
    const appOutDir = mkdtempSync(join(tmpdir(), 'pilog-packaged-perf-test-'))
    tempDirs.push(appOutDir)

    if (process.platform === 'darwin') {
      const executable = join(appOutDir, 'Pilog.app', 'Contents', 'MacOS', 'Pilog')
      mkdirSync(join(appOutDir, 'Pilog.app', 'Contents', 'MacOS'), { recursive: true })
      writeFileSync(executable, '', { flag: 'w' })
    } else {
      const executableName = process.platform === 'win32' ? 'Pilog.exe' : 'pilog'
      writeFileSync(join(appOutDir, executableName), '', { flag: 'w' })
    }

    expect(findPackagedExecutable({ appOutDir })).toContain(appOutDir)
  })

  it('builds a comparable report with metadata and named scenario timings', () => {
    const report = createEmptyReport({
      packageJson: { name: 'pilog', version: '1.2.3-preview.7' },
      appOutDir: '/tmp/pilog-app',
      executablePath: '/tmp/pilog-app/pilog',
      userDataDir: '/tmp/user-data',
      repoDir: '/tmp/repo'
    })

    addScenario(report, {
      name: 'cold_launch_to_usable_main_window',
      durationMs: 123.456,
      details: { visibleHeading: 'Inbox' }
    })
    addScenario(report, { name: 'fixture_agent_run_to_draft', durationMs: 987.65 })

    expect(report).toMatchObject({
      schemaVersion: 1,
      metadata: {
        packageName: 'pilog',
        packageVersion: '1.2.3-preview.7',
        platform: process.platform,
        arch: process.arch,
        packagedApp: {
          appOutDir: '/tmp/pilog-app',
          executablePath: '/tmp/pilog-app/pilog'
        }
      },
      diagnostics: {
        debugIpc: true,
        userDataDir: '/tmp/user-data',
        repoDir: '/tmp/repo'
      },
      scenarios: [
        {
          name: 'cold_launch_to_usable_main_window',
          durationMs: 123.5,
          status: 'ok',
          details: { visibleHeading: 'Inbox' }
        },
        {
          name: 'fixture_agent_run_to_draft',
          durationMs: 987.7,
          status: 'ok'
        }
      ]
    })
  })

  it('parses CLI options and formats scenario summaries', () => {
    const options = parseArgs([
      '--',
      '--app-out-dir',
      'dist/linux-unpacked',
      '--output',
      'dist/perf.json',
      '--json',
      '--keep-user-data'
    ])
    expect(options).toMatchObject({
      appOutDir: 'dist/linux-unpacked',
      outputPath: 'dist/perf.json',
      json: true,
      keepUserData: true,
      keepRepoDir: false
    })
    expect(parseArgs([]).outputPath).toBe(DEFAULT_REPORT_PATH)

    const report = createEmptyReport({
      packageJson: { name: 'pilog', version: '1.2.3-preview.7' },
      appOutDir: '/tmp/pilog-app',
      executablePath: '/tmp/pilog-app/pilog',
      userDataDir: '/tmp/user-data',
      repoDir: '/tmp/repo'
    })
    addScenario(report, { name: 'scratchpad_open', durationMs: 42 })

    expect(formatSummary(report, '/tmp/report.json')).toContain('scratchpad_open: 42ms')
  })
})
