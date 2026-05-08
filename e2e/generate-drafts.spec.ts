import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let userDataDir: string
let repoDir: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'pilog-e2e-'))
  repoDir = mkdtempSync(join(tmpdir(), 'pilog-fixture-repo-'))
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true })
  rmSync(repoDir, { recursive: true, force: true })
})

async function launchApp(): Promise<ElectronApplication> {
  const app = await electron.launch({
    args: [join(__dirname, '../app/out/main/index.js')],
    env: { ...process.env, PILOG_USER_DATA: userDataDir, PILOG_DEBUG_IPC: '1' }
  })
  await app.evaluate(({ ipcMain }) => ipcMain.emit('tray:open-inbox'))
  return app
}

test('Generate Drafts persists one issue draft from selected repo notes', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  await page.evaluate(
    async ({ repoPath }) => {
      await window.pilog.invoke('debug:seedIssueGenerationFixture', {
        repoPath,
        notes: ['save button needs loading state', 'settings spacing is odd on mobile']
      })
    },
    { repoPath: repoDir }
  )
  await page.reload()

  const noteRows = page.locator('[data-testid="note-row"]')
  await expect(noteRows).toHaveCount(2)

  await noteRows.first().click()
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await noteRows.nth(1).click({ modifiers: [modifier] })

  const generate = page.locator('button:has-text("Generate Drafts")')
  await expect(generate).toBeEnabled()
  await generate.click()

  await expect
    .poll(async () => {
      return page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts'))
    })
    .toHaveLength(1)

  const drafts = await page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts'))
  expect(drafts[0]?.title).toBeTruthy()
  expect(drafts[0]?.body).toContain('save button needs loading state')
  expect(drafts[0]?.groupingReason).toBeTruthy()

  await app.close()
})

test('Agent Runs shows live generation, detail transcript, and source note navigation', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  await page.evaluate(
    async ({ repoPath }) => {
      await window.pilog.invoke('debug:seedIssueGenerationFixture', {
        repoPath,
        notes: ['save button needs loading state', 'settings spacing is odd on mobile']
      })
    },
    { repoPath: repoDir }
  )
  await page.reload()

  const noteRows = page.locator('[data-testid="note-row"]')
  await expect(noteRows).toHaveCount(2)

  await noteRows.first().click()
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await noteRows.nth(1).click({ modifiers: [modifier] })

  await page.locator('button:has-text("Generate Drafts")').click()
  await page.locator('[data-testid="open-agent-runs"]').click()

  const runRows = page.locator('[data-testid="agent-run-row"]')
  await expect(runRows.first()).toContainText('running')
  await expect(runRows.first()).toContainText('succeeded')
  await expect(runRows.first()).toContainText('1 drafts')

  await runRows.first().click()
  await expect(page.locator('[data-testid="run-output-draft"]')).toContainText(
    'Triage selected PiLog notes'
  )
  await expect(page.locator('[data-testid="run-event-transcript"]')).toContainText('agent_start')

  await page.locator('[data-testid="run-source-note"]').first().click()
  await expect(page.locator('h1')).toHaveText('Inbox')
  await expect(page.locator('textarea[aria-label="Note content"]')).toHaveValue(
    'settings spacing is odd on mobile'
  )

  await app.close()
})
