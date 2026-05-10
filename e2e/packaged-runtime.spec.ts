import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

let userDataDir: string
let repoDir: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'pilog-packaged-e2e-'))
  repoDir = mkdtempSync(join(tmpdir(), 'pilog-packaged-fixture-repo-'))
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  rmSync(repoDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function launchPackagedApp(): Promise<ElectronApplication> {
  const app = await electron.launch({
    executablePath: findPackagedExecutable(),
    env: { ...process.env, PILOG_USER_DATA: userDataDir, PILOG_DEBUG_IPC: '1' }
  })
  await app.evaluate(async ({ app, ipcMain }) => {
    await app.whenReady()
    await new Promise((resolve) => setTimeout(resolve, 100))
    ipcMain.emit('tray:open-inbox')
  })
  return app
}

async function exitApp(app: ElectronApplication): Promise<void> {
  const child = app.process()
  await Promise.race([
    app.evaluate(({ app }) => app.exit(0)).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 500))
  ])
  if (!child.killed) child.kill('SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 100))
}

function findPackagedExecutable(): string {
  const candidates =
    process.platform === 'win32'
      ? [resolve('dist/win-unpacked/Pilog.exe')]
      : process.platform === 'darwin'
        ? [resolve('dist/mac/Pilog.app/Contents/MacOS/Pilog')]
        : [resolve('dist/linux-unpacked/pilog'), resolve('dist/linux-unpacked/Pilog')]

  const executable = candidates.find((candidate) => existsSync(candidate))
  if (!executable) {
    throw new Error(`Packaged executable not found. Checked: ${candidates.join(', ')}`)
  }
  return executable
}

test('packaged app launches and resolves runtime dependencies', async () => {
  test.setTimeout(60000)

  const app = await launchPackagedApp()
  const page = await app.firstWindow()

  try {
    await expect(page.locator('h1')).toHaveText('Inbox')

    const health = await page.evaluate(async () => window.pilog.invoke('debug:runtimeHealth'))
    expect(health.appId).toBe('dev.pilog.app')
    expect(health.productName).toBe('Pilog')
    expect(health.expectedProductName).toBe('Pilog')
    expect(health.packaged).toBe(true)
    expect(health.defaultApp).toBe(false)
    expect(health.iconExists).toBe(true)
    expect(health.iconFilename).toBe('icon.png')
    expect(health.sqlite.ok).toBe(true)
    expect(health.piAgentCore.ok).toBe(true)
    expect(health.piAi.ok).toBe(true)
    expect(health.ripgrep.ok).toBe(true)
    expect(health.ripgrep.fromAsarUnpacked).toBe(true)
    expect(health.boilerplateFree).toEqual({ appId: true, productName: true })

    const note = await page.evaluate(async () =>
      window.pilog.invoke('note:create', { content: 'packaged runtime note' })
    )
    expect(note.content).toBe('packaged runtime note')
    await expect
      .poll(async () => page.evaluate(async () => window.pilog.invoke('note:list', undefined)))
      .toHaveLength(1)

    await page.evaluate(
      async ({ repoPath }) => {
        await window.pilog.invoke('debug:seedIssueGenerationFixture', {
          repoPath,
          notes: [
            'packaged build can generate fixture drafts',
            'packaged smoke can open packaged draft review'
          ]
        })
      },
      { repoPath: repoDir }
    )
    await page.reload()

    const noteRows = page.locator('[data-testid="note-row"]')
    await expect(
      noteRows.filter({ hasText: 'packaged build can generate fixture drafts' })
    ).toHaveCount(1)
    await noteRows.filter({ hasText: 'packaged build can generate fixture drafts' }).click()
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await noteRows
      .filter({ hasText: 'packaged smoke can open packaged draft review' })
      .click({ modifiers: [modifier] })
    const generateDrafts = page.getByRole('button', { name: 'Generate Drafts', exact: true })
    await expect(generateDrafts).toBeEnabled()
    await generateDrafts.click()
    await expect
      .poll(async () => page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts')))
      .toHaveLength(1)

    const draftTabTrigger = page.locator('[data-testid="view-tab-drafts-trigger"]')
    if ((await draftTabTrigger.count()) > 0) {
      await draftTabTrigger.click()
    }
    await expect(page.getByRole('heading', { name: 'Draft Review' })).toBeVisible()
    await page.locator('[data-testid="open-settings"]').click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.getByRole('button', { name: 'Manage repositories →' }).click()
    await expect(page.getByRole('heading', { name: 'Repositories' })).toBeVisible()
  } finally {
    await exitApp(app)
  }
})
