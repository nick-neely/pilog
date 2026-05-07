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
    args: [join(__dirname, '../out/main/index.js')],
    env: { ...process.env, PILOG_USER_DATA: userDataDir }
  })
}

test('scratchpad: menu → type → Esc → note visible in inbox', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()

  await expect(inboxPage.locator('h1')).toHaveText('Inbox')
  await expect(inboxPage.locator('main li')).toHaveCount(0)

  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const fileMenu = menu?.items.find((item) => item.label === 'File')
    const newNote = fileMenu?.submenu?.items.find((item) => item.label === 'New Note')
    newNote?.click()
  })

  const scratchpadPage = await app.waitForEvent('window', { timeout: 5000 })

  await scratchpadPage.waitForLoadState('domcontentloaded')
  await scratchpadPage.locator('.cm-content').waitFor({ state: 'visible', timeout: 5000 })

  await scratchpadPage.locator('.cm-content').click()
  await scratchpadPage.keyboard.type('fix the navbar z-index bug')

  await scratchpadPage.keyboard.press('Escape')

  await expect(inboxPage.locator('main li')).toHaveCount(1, { timeout: 5000 })
  await expect(inboxPage.locator('main li').first()).toContainText('fix the navbar z-index bug')

  await app.close()
})

test('scratchpad: Cmd+S saves but window stays open', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()

  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const fileMenu = menu?.items.find((item) => item.label === 'File')
    const newNote = fileMenu?.submenu?.items.find((item) => item.label === 'New Note')
    newNote?.click()
  })

  const scratchpadPage = await app.waitForEvent('window', { timeout: 5000 })
  await scratchpadPage.waitForLoadState('domcontentloaded')
  await scratchpadPage.locator('.cm-content').waitFor({ state: 'visible', timeout: 5000 })

  await scratchpadPage.locator('.cm-content').click()
  await scratchpadPage.keyboard.type('remember to update docs')

  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await scratchpadPage.keyboard.press(`${mod}+s`)

  await expect(inboxPage.locator('main li')).toHaveCount(1, { timeout: 5000 })

  const windows = await app.windows()
  const scratchpadStillOpen = windows.some((w) => w !== inboxPage && w.url().includes('scratchpad'))
  expect(scratchpadStillOpen).toBe(true)

  await app.close()
})

test('scratchpad: empty buffer on Esc does not create a note', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()

  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()
    const fileMenu = menu?.items.find((item) => item.label === 'File')
    const newNote = fileMenu?.submenu?.items.find((item) => item.label === 'New Note')
    newNote?.click()
  })

  const scratchpadPage = await app.waitForEvent('window', { timeout: 5000 })
  await scratchpadPage.waitForLoadState('domcontentloaded')
  await scratchpadPage.locator('.cm-content').waitFor({ state: 'visible', timeout: 5000 })

  await scratchpadPage.keyboard.press('Escape')

  await inboxPage.waitForTimeout(500)
  await expect(inboxPage.locator('main li')).toHaveCount(0)

  await app.close()
})
