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
  const app = await electron.launch({
    args: [join(__dirname, '../app/out/main/index.js')],
    env: { ...process.env, PILOG_USER_DATA: userDataDir }
  })
  await app.evaluate(({ ipcMain }) => ipcMain.emit('tray:open-inbox'))
  return app
}

test('note round-trip: create note, restart, note persists', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  await expect(page.locator('h1')).toHaveText('Inbox')
  await expect(page.locator('main li')).toHaveCount(0)

  await page.click('button:has-text("New note")')
  await expect(page.locator('main li')).toHaveCount(1)

  await app.close()

  const app2 = await launchApp()
  const page2 = await app2.firstWindow()

  await expect(page2.locator('h1')).toHaveText('Inbox')
  await expect(page2.locator('main li')).toHaveCount(1)

  await app2.close()
})
