const { _electron: electron } = require('@playwright/test')
const {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} = require('node:fs')
const { tmpdir } = require('node:os')
const { dirname, join, resolve } = require('node:path')
const { performance } = require('node:perf_hooks')
const { execFileSync } = require('node:child_process')

const REPORT_SCHEMA_VERSION = 1
const DEFAULT_REPORT_PATH = 'dist/packaged-performance-baseline.json'
const FIXTURE_NOTE_CONTENTS = [
  'packaged performance can generate fixture drafts',
  'packaged performance can navigate draft review'
]

function findPackagedExecutable(options = {}) {
  const appOutDir = options.appOutDir ? resolve(options.appOutDir) : null
  const candidates = packagedExecutableCandidates(appOutDir)
  const checked = candidates.filter(Boolean)
  const executable = checked.find((candidate) => existsSync(candidate))
  if (!executable) {
    throw new Error(`Packaged executable not found. Checked: ${checked.join(', ')}`)
  }
  return executable
}

function packagedExecutableCandidates(appOutDir) {
  switch (process.platform) {
    case 'win32':
      return [
        appOutDir ? join(appOutDir, 'Pilog.exe') : null,
        resolve('dist/win-unpacked/Pilog.exe')
      ]
    case 'darwin':
      return [
        appOutDir?.endsWith('.app') ? join(appOutDir, 'Contents/MacOS/Pilog') : null,
        appOutDir ? join(appOutDir, 'Pilog.app/Contents/MacOS/Pilog') : null,
        resolve('dist/mac/Pilog.app/Contents/MacOS/Pilog')
      ]
    default:
      return [
        appOutDir ? join(appOutDir, 'pilog') : null,
        appOutDir ? join(appOutDir, 'Pilog') : null,
        resolve('dist/linux-unpacked/pilog'),
        resolve('dist/linux-unpacked/Pilog')
      ]
  }
}

function createEmptyReport(input) {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    metadata: {
      packageName: input.packageJson.name,
      packageVersion: input.packageJson.version,
      appVersion: null,
      productName: null,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: null,
      packagedApp: {
        appOutDir: input.appOutDir,
        executablePath: input.executablePath,
        resourcesPath: null
      },
      gitSha: readGitSha(),
      ci: process.env.CI === 'true'
    },
    diagnostics: {
      debugIpc: true,
      userDataDir: input.userDataDir,
      repoDir: input.repoDir
    },
    scenarios: []
  }
}

function addScenario(report, scenario) {
  report.scenarios.push({
    name: scenario.name,
    durationMs: Math.round(scenario.durationMs * 10) / 10,
    status: scenario.status ?? 'ok',
    details: scenario.details ?? {}
  })
}

async function measureScenario(report, name, callback) {
  const started = performance.now()
  const details = await callback()
  addScenario(report, {
    name,
    durationMs: performance.now() - started,
    details
  })
}

async function runPackagedPerformance(options = {}) {
  const executablePath = options.executablePath ?? findPackagedExecutable(options)
  const appOutDir = options.appOutDir ? resolve(options.appOutDir) : dirname(executablePath)
  const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
  const userDataDir = options.userDataDir ?? mkdtempSync(join(tmpdir(), 'pilog-packaged-perf-'))
  const repoDir = options.repoDir ?? mkdtempSync(join(tmpdir(), 'pilog-packaged-perf-repo-'))
  const report = createEmptyReport({ packageJson, appOutDir, executablePath, userDataDir, repoDir })
  let app

  try {
    const launchStarted = performance.now()
    app = await electron.launch({
      executablePath,
      env: { ...process.env, PILOG_USER_DATA: userDataDir, PILOG_DEBUG_IPC: '1' }
    })
    await app.evaluate(async ({ app, ipcMain }) => {
      await app.whenReady()
      await new Promise((resolve) => setTimeout(resolve, 100))
      ipcMain.emit('tray:open-inbox')
    })
    const page = await app.firstWindow()
    await page.locator('h1').waitFor({ state: 'visible' })
    await page.getByRole('heading', { name: 'Inbox' }).waitFor({ state: 'visible' })
    addScenario(report, {
      name: 'cold_launch_to_usable_main_window',
      durationMs: performance.now() - launchStarted,
      details: { visibleHeading: 'Inbox' }
    })

    const appMetadata = await readAppMetadata(app)
    Object.assign(report.metadata, appMetadata, {
      packagedApp: {
        ...report.metadata.packagedApp,
        ...appMetadata.packagedApp
      }
    })

    await measureScenario(report, 'scratchpad_open', async () => {
      const scratchpadPromise = app.waitForEvent('window')
      await clickApplicationMenuItem(app, 'New Note')
      const scratchpad = await scratchpadPromise
      await scratchpad.locator('.cm-content').waitFor({ state: 'visible' })
      await scratchpad.keyboard.press('Escape')
      return { trigger: 'application-menu:new-note', readySelector: '.cm-content' }
    })

    await measureScenario(report, 'note_create_and_list', async () => {
      const content = `packaged performance note ${Date.now()}`
      const note = await page.evaluate(
        async (noteContent) => window.pilog.invoke('note:create', { content: noteContent }),
        content
      )
      await page.waitForFunction(
        async (noteId) => {
          const notes = await window.pilog.invoke('note:list', undefined)
          return notes.some((candidate) => candidate.id === noteId)
        },
        note.id,
        { timeout: 5000 }
      )
      return { createdNoteId: note.id }
    })

    const fixture = await seedIssueGenerationFixture(page, repoDir)
    await page.reload()
    await selectFixtureNotes(page)

    await measureScenario(report, 'fixture_agent_run_to_draft', async () => {
      await page.getByRole('button', { name: 'Generate Drafts', exact: true }).click()
      await page.waitForFunction(
        async () => {
          const drafts = await window.pilog.invoke('debug:listIssueDrafts')
          return drafts.length > 0
        },
        undefined,
        { timeout: 30000 }
      )
      const drafts = await page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts'))
      return {
        repoId: fixture.repoId,
        noteCount: fixture.noteIds.length,
        draftCount: drafts.length
      }
    })

    await measureScenario(report, 'draft_review_navigation', async () => {
      const draftTabTrigger = page.locator('[data-testid="view-tab-drafts-trigger"]')
      if ((await draftTabTrigger.count()) > 0) {
        await draftTabTrigger.click()
      }
      await page.getByRole('heading', { name: 'Draft Review' }).waitFor({ state: 'visible' })
      return { target: 'Draft Review' }
    })
  } finally {
    if (app) await exitApp(app)
    if (!options.keepUserData) {
      rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
    if (!options.keepRepoDir) {
      rmSync(repoDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    }
  }

  return report
}

async function seedIssueGenerationFixture(page, repoDir) {
  return await page.evaluate(
    async ({ repoPath }) =>
      window.pilog.invoke('debug:seedIssueGenerationFixture', {
        repoPath,
        notes: FIXTURE_NOTE_CONTENTS
      }),
    { repoPath: repoDir }
  )
}

async function selectFixtureNotes(page) {
  const noteRows = page.locator('[data-testid="note-row"]')
  await noteRows.filter({ hasText: FIXTURE_NOTE_CONTENTS[0] }).click()
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await noteRows.filter({ hasText: FIXTURE_NOTE_CONTENTS[1] }).click({ modifiers: [modifier] })
  await page.getByRole('button', { name: 'Generate Drafts', exact: true }).waitFor({
    state: 'visible'
  })
}

async function clickApplicationMenuItem(app, label) {
  await app.evaluate(({ BrowserWindow, Menu }, targetLabel) => {
    const menu = Menu.getApplicationMenu()
    const item = findMenuItem(menu?.items ?? [], targetLabel)
    if (!item) throw new Error(`Application menu item not found: ${targetLabel}`)
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    item.click(undefined, focusedWindow, focusedWindow?.webContents)

    function findMenuItem(items, label) {
      for (const candidate of items) {
        if (normalizeLabel(candidate.label) === normalizeLabel(label)) return candidate
        const nested = findMenuItem(candidate.submenu?.items ?? [], label)
        if (nested) return nested
      }
      return null
    }

    function normalizeLabel(value) {
      return String(value).replaceAll('&', '').replaceAll('...', '').replaceAll('…', '').trim()
    }
  }, label)
}

async function readAppMetadata(app) {
  return await app.evaluate(({ app }) => ({
    appVersion: app.getVersion(),
    productName: app.getName(),
    electronVersion: process.versions.electron,
    packagedApp: {
      resourcesPath: process.resourcesPath
    }
  }))
}

async function exitApp(app) {
  const child = app.process()
  await Promise.race([
    app.evaluate(({ app }) => app.exit(0)).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 500))
  ])
  if (!child.killed) child.kill('SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 100))
}

function readGitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

function parseArgs(argv) {
  const options = {
    outputPath: DEFAULT_REPORT_PATH,
    json: false,
    keepUserData: false,
    keepRepoDir: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--':
        break
      case '--app-out-dir':
        index += 1
        options.appOutDir = requireValue(argv, index, arg)
        break
      case '--executable':
        index += 1
        options.executablePath = requireValue(argv, index, arg)
        break
      case '--output':
        index += 1
        options.outputPath = requireValue(argv, index, arg)
        break
      case '--json':
        options.json = true
        break
      case '--keep-user-data':
        options.keepUserData = true
        break
      case '--keep-repo-dir':
        options.keepRepoDir = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

function requireValue(argv, index, flag) {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
  return value
}

function writeReport(report, outputPath) {
  const resolvedOutput = resolve(outputPath)
  mkdirSync(dirname(resolvedOutput), { recursive: true })
  writeFileSync(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`)
  return resolvedOutput
}

function formatSummary(report, outputPath) {
  const appName = report.metadata.productName ?? report.metadata.packageName
  const appVersion = report.metadata.appVersion ?? report.metadata.packageVersion
  const lines = [
    '[packaged-performance] baseline complete',
    `[packaged-performance] report: ${outputPath}`,
    `[packaged-performance] app: ${appName} ${appVersion} (${report.metadata.platform}/${report.metadata.arch})`
  ]

  for (const scenario of report.scenarios) {
    lines.push(`[packaged-performance] ${scenario.name}: ${scenario.durationMs}ms`)
  }

  return lines.join('\n')
}

function usage() {
  return [
    'Usage: node scripts/packaged-performance.cjs [options]',
    '',
    'Options:',
    '  --app-out-dir <dir>   Unpacked Electron Builder output directory.',
    '  --executable <path>   Packaged executable path. Overrides --app-out-dir lookup.',
    `  --output <path>       Report path. Defaults to ${DEFAULT_REPORT_PATH}.`,
    '  --json                Print the full JSON report after writing it.',
    '  --keep-user-data      Keep the temporary app userData directory for diagnosis.',
    '  --keep-repo-dir       Keep the temporary fixture repo directory for diagnosis.'
  ].join('\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }
  const report = await runPackagedPerformance(options)
  const outputPath = writeReport(report, options.outputPath)
  console.log(formatSummary(report, outputPath))
  if (options.json) console.log(JSON.stringify(report, null, 2))
}

module.exports = {
  DEFAULT_REPORT_PATH,
  findPackagedExecutable,
  createEmptyReport,
  addScenario,
  parseArgs,
  formatSummary,
  writeReport,
  runPackagedPerformance
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
