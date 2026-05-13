import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
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
  // Tray-first boot: explicitly open inbox for tests that need it
  await app.evaluate(({ ipcMain }) => ipcMain.emit('tray:open-inbox'))
  return app
}

async function openScratchpadFromMenu(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const fileMenu = menu?.items.find((item) => item.label === 'File')
    const newNote = fileMenu?.submenu?.items.find((item) => item.label === 'New Note')
    newNote?.click()
  })
}

async function waitForScratchpad(app: ElectronApplication): Promise<Page> {
  const page = await app.waitForEvent('window', { timeout: 5000 })
  await page.waitForLoadState('domcontentloaded')
  await page.locator('.cm-content').waitFor({ state: 'visible', timeout: 5000 })
  return page
}

async function isScratchpadVisible(app: ElectronApplication): Promise<boolean> {
  return app.evaluate(({ BrowserWindow }) => {
    const scratchpadWindow = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('scratchpad')
    )
    return scratchpadWindow?.isVisible() ?? false
  })
}

test('scratchpad: menu → type → Esc → note visible in inbox', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()

  await expect(inboxPage.locator('h1')).toHaveText('Inbox')
  await expect(inboxPage.locator('main li')).toHaveCount(0)

  await openScratchpadFromMenu(app)
  const scratchpadPage = await waitForScratchpad(app)

  await scratchpadPage.locator('.cm-content').click()
  await scratchpadPage.keyboard.type('fix the navbar z-index bug')

  await scratchpadPage.keyboard.press('Escape')

  await expect(inboxPage.locator('main li')).toHaveCount(1, { timeout: 5000 })
  await expect(inboxPage.locator('main li').first()).toContainText('fix the navbar z-index bug')

  await app.close()
})

test('scratchpad: Cmd+S saves and hides the window', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()

  await openScratchpadFromMenu(app)
  const scratchpadPage = await waitForScratchpad(app)

  await scratchpadPage.locator('.cm-content').click()
  await scratchpadPage.keyboard.type('remember to update docs')

  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await scratchpadPage.keyboard.press(`${mod}+s`)

  await expect(inboxPage.locator('main li')).toHaveCount(1, { timeout: 5000 })
  await expect.poll(() => isScratchpadVisible(app), { timeout: 5000 }).toBe(false)

  await app.close()
})

test('scratchpad: empty buffer on Esc does not create a note', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()

  await openScratchpadFromMenu(app)
  const scratchpadPage = await waitForScratchpad(app)

  await scratchpadPage.keyboard.press('Escape')

  await inboxPage.waitForTimeout(500)
  await expect(inboxPage.locator('main li')).toHaveCount(0)

  await app.close()
})
