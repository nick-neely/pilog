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

test('tray-first: no main window on default launch', async () => {
  const app = await launchApp()

  const windows = app.windows()
  expect(windows.length).toBe(0)

  await app.close()
})

test('tray-first: Open Inbox action shows main window', async () => {
  const app = await launchApp()

  expect(app.windows().length).toBe(0)

  await app.evaluate(({ ipcMain }) => {
    ipcMain.emit('tray:open-inbox')
  })

  const inboxPage = await app.firstWindow()
  await inboxPage.waitForLoadState('domcontentloaded')
  await expect(inboxPage.locator('h1')).toHaveText('Inbox')

  await app.close()
})
