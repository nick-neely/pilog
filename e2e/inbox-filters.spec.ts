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
    args: [join(__dirname, '../out/main/index.js')],
    env: { ...process.env, PILOG_USER_DATA: userDataDir }
  })
  await app.evaluate(({ ipcMain }) => ipcMain.emit('tray:open-inbox'))
  return app
}

test('inbox filters, search, and multi-select', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  await expect(page.locator('h1')).toHaveText('Inbox')

  // Create three notes with distinct content
  await page.click('button:has-text("New note")')
  await page.click('button:has-text("New note")')
  await page.click('button:has-text("New note")')

  const noteRows = page.locator('[data-testid="note-row"]')
  await expect(noteRows).toHaveCount(3)

  // Filter by status — all notes are 'unprocessed' by default
  await page.click('[data-testid="filter-unprocessed"]')
  await expect(noteRows).toHaveCount(3)

  // Filter by 'drafted' — no notes should match
  await page.click('[data-testid="filter-unprocessed"]') // deselect
  await page.click('[data-testid="filter-drafted"]')
  await expect(noteRows).toHaveCount(0)

  // Deselect to see all again
  await page.click('[data-testid="filter-drafted"]')
  await expect(noteRows).toHaveCount(3)

  // Search — all notes contain "New note"
  const searchInput = page.locator('[data-testid="search-input"]')
  await searchInput.fill('New note')
  await expect(noteRows).toHaveCount(3)

  // Search with no match
  await searchInput.fill('nonexistent')
  await expect(noteRows).toHaveCount(0)

  // Clear search
  await searchInput.fill('')
  await expect(noteRows).toHaveCount(3)

  // Multi-select: click first note
  await noteRows.first().click()
  await expect(page.locator('[data-testid="selected-count"]')).toHaveText('1 selected')

  // Ctrl/Cmd+click second note to add to selection
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await noteRows.nth(1).click({ modifiers: [modifier] })
  await expect(page.locator('[data-testid="selected-count"]')).toHaveText('2 selected')

  // Bulk action buttons should be visible but disabled
  const generateBtn = page.locator('button:has-text("Generate Drafts")')
  const dismissBtn = page.locator('button:has-text("Dismiss")')
  await expect(generateBtn).toBeVisible()
  await expect(generateBtn).toBeDisabled()
  await expect(dismissBtn).toBeVisible()
  await expect(dismissBtn).toBeDisabled()

  await app.close()
})
