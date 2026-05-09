import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

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

  // Cmd+K palette: sidebar stays on status/repo filters only; palette search
  // matches notes inside the dialog only.
  await page.click('[data-testid="open-command"]')
  const searchInput = page.locator('[data-testid="search-input"]')
  await expect(searchInput).toBeVisible()

  const unique = `palette-filter-${Date.now()}`
  await noteRows.first().click()
  await page.locator('[aria-label="Note content"]').fill(unique)
  const saveMod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${saveMod}+s`)

  await searchInput.fill(unique)
  await expect(page.locator('[data-testid="palette-note-row"]')).toHaveCount(1)
  await expect(noteRows).toHaveCount(3)

  await page.locator('[data-testid="palette-note-row"]').first().click()
  await expect(searchInput).not.toBeVisible()
  await expect(page.locator('[data-testid="selected-count"]')).toHaveText('1 selected')

  await page.click('[data-testid="open-command"]')
  await searchInput.fill('nonexistent-xyz-abc')
  await expect(page.locator('[data-testid="palette-note-row"]')).toHaveCount(0)
  await expect(noteRows).toHaveCount(3)

  // Clear search and close palette
  await searchInput.fill('')
  await page.keyboard.press('Escape')
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
