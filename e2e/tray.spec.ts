import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let userDataDir: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'pilog-e2e-'))
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
})

async function launchApp(): Promise<ElectronApplication> {
  return electron.launch({
    args: [join(__dirname, '../app/out/main/index.js')],
    env: { ...process.env, PILOG_USER_DATA: userDataDir }
  })
}

async function exitApp(app: ElectronApplication): Promise<void> {
  const process = app.process()
  await Promise.race([
    app.evaluate(({ app }) => app.exit(0)).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 500))
  ])
  if (!process.killed) process.kill('SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 100))
}

test('first launch opens the visible inbox onboarding path', async () => {
  const app = await launchApp()

  const inboxPage = await app.firstWindow()
  await inboxPage.waitForLoadState('domcontentloaded')
  await expect(inboxPage.locator('h1')).toHaveText('Inbox')
  await expect(inboxPage.locator('[data-testid="onboarding-panel"]')).toBeVisible()
  await expect(inboxPage.locator('[data-testid="onboarding-step-hotkey"]')).toHaveAttribute(
    'aria-current',
    'step'
  )

  await exitApp(app)
})

test('tray-first: skipped onboarding does not show the main window on default launch', async () => {
  let app = await launchApp()
  const inboxPage = await app.firstWindow()
  await inboxPage.getByRole('button', { name: 'Skip for now' }).click()
  await expect(inboxPage.getByRole('button', { name: 'Resume first-run setup' })).toBeVisible()
  await exitApp(app)

  app = await launchApp()
  expect(app.windows().length).toBe(0)
  await exitApp(app)
})

test('tray-first: Open Inbox action shows main window', async () => {
  let app = await launchApp()
  let inboxPage = await app.firstWindow()
  await inboxPage.getByRole('button', { name: 'Skip for now' }).click()
  await exitApp(app)

  app = await launchApp()

  expect(app.windows().length).toBe(0)

  await app.evaluate(({ ipcMain }) => {
    ipcMain.emit('tray:open-inbox')
  })

  inboxPage = await app.firstWindow()
  await inboxPage.waitForLoadState('domcontentloaded')
  await expect(inboxPage.locator('h1')).toHaveText('Inbox')

  await exitApp(app)
})
