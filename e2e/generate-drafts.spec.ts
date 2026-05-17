import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let userDataDir: string
let repoDir: string

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'pilog-e2e-'))
  repoDir = mkdtempSync(join(tmpdir(), 'pilog-fixture-repo-'))
})

test.afterEach(() => {
  rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  rmSync(repoDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function launchApp(): Promise<ElectronApplication> {
  const app = await electron.launch({
    args: [join(__dirname, '../app/out/main/index.js')],
    env: { ...process.env, PILOG_USER_DATA: userDataDir, PILOG_DEBUG_IPC: '1' }
  })
  await app.evaluate(({ ipcMain }) => ipcMain.emit('tray:open-inbox'))
  return app
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

test('Generate Drafts persists one issue draft from selected repo notes', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  try {
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

    const draftTabTrigger = page.locator('[data-testid="view-tab-drafts-trigger"]')
    if ((await draftTabTrigger.count()) > 0) {
      await draftTabTrigger.click()
    }
    await expect(page.locator('[data-testid="draft-row"]')).toHaveCount(1)
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click()

    await expect
      .poll(async () => {
        const reloadedDrafts = await page.evaluate(async () =>
          window.pilog.invoke('debug:listIssueDrafts')
        )
        return reloadedDrafts[0]?.status
      })
      .toBe('dismissed')

    await page.reload()
    await page.locator('[data-testid="view-tab-drafts-trigger"]').click()
    await expect(page.locator('[data-testid="draft-row"]')).toHaveCount(0)
    await page.locator('[data-testid="filter-dismissed"]').click()
    await expect(page.locator('[data-testid="draft-row"]')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()
  } finally {
    await exitApp(app)
  }
})

test('Generate and Publish dry run previews planned drafts without publish writes', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  try {
    const seed = await page.evaluate(
      async ({ repoPath }) => {
        return window.pilog.invoke('debug:seedIssueGenerationFixture', {
          repoPath,
          notes: ['dry run publish: save button needs loading state']
        })
      },
      { repoPath: repoDir }
    )
    await page.evaluate(async ({ repoId }) => {
      await window.pilog.invoke('repos:updateAutoPublishSettings', {
        id: repoId,
        autoPublishEnabled: true,
        autoPublishMaxIssuesPerRun: 2,
        autoPublishDefaultLabel: 'ready-for-agent',
        autoPublishDryRun: true,
        autoPublishRequireConfirmation: true,
        autoPublishMinimumConfidence: 'high',
        autoPublishRequireKnownAffectedFiles: true
      })
    }, seed)
    await page.reload()

    const noteRows = page.locator('[data-testid="note-row"]')
    await expect(noteRows).toHaveCount(1)
    await noteRows.first().click()

    const generateAndPublish = page.getByRole('button', {
      name: 'Generate and Publish',
      exact: true
    })
    await expect(generateAndPublish).toBeEnabled()
    await generateAndPublish.click()

    await expect(page.getByRole('alertdialog')).toContainText('Dry-run publish plan')
    await page.getByTestId('dry-run-publish-disclosure').focus()
    await expect(page.getByText('Preview only')).toBeVisible()
    await expect(page.getByRole('alertdialog')).toContainText('Triage selected Pilog notes')
    await expect(page.getByRole('alertdialog')).toContainText('ready-for-agent')

    const drafts = await page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts'))
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.labels).toEqual(['triaged-by-pilog', 'ready-for-agent'])
    await expect
      .poll(async () =>
        page.evaluate(async ({ repoId }) => {
          return window.pilog.invoke('debug:listPublishLog', { repoId })
        }, seed)
      )
      .toEqual([])
  } finally {
    await exitApp(app)
  }
})

test('Draft Review explains an empty queue and returns to Inbox', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  await page.locator('[data-testid="view-tab-drafts-trigger"]').click()

  await expect(page.getByText('No drafts yet').first()).toBeVisible()
  await expect(page.getByText('Generate drafts from selected inbox notes.').first()).toBeVisible()

  await page.getByRole('button', { name: 'Open Inbox' }).first().click()
  await expect(page.locator('h1')).toHaveText('Inbox')

  await exitApp(app)
})

test('Draft Review blocks publish when GitHub is not connected', async () => {
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
  await noteRows.first().click()
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await noteRows.nth(1).click({ modifiers: [modifier] })
  await page.locator('button:has-text("Generate Drafts")').click()

  await expect
    .poll(async () => page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts')))
    .toHaveLength(1)

  await page.evaluate(async () => window.pilog.invoke('github:signOut'))
  await page.locator('[data-testid="view-tab-inbox-trigger"]').click()
  await page.locator('[data-testid="view-tab-drafts-trigger"]').click()

  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('GitHub is not connected.')
  await expect(page.getByText('Connect GitHub before publishing this draft.')).toBeVisible()

  await exitApp(app)
})

test('Pi config setup persists across restart and unblocks Generate Drafts', async () => {
  let app = await launchApp()
  let page = await app.firstWindow()

  await page.evaluate(
    async ({ repoPath }) => {
      await window.pilog.invoke('debug:seedIssueGenerationFixture', {
        repoPath,
        notes: ['save button needs loading state', 'settings spacing is odd on mobile']
      })
      await window.pilog.invoke('pi:resetConfig')
    },
    { repoPath: repoDir }
  )
  await page.reload()

  let noteRows = page.locator('[data-testid="note-row"]')
  await expect(noteRows).toHaveCount(2)
  await noteRows.first().click()
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await noteRows.nth(1).click({ modifiers: [modifier] })

  await expect(page.getByRole('button', { name: 'Generate Drafts', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Configure Pi to generate drafts' }).click()

  await expect(page.locator('[data-testid="pi-config-panel"]')).toBeVisible()
  await page.locator('[data-testid="pi-api-key-input"]').fill('sk-e2e-test')
  await page.locator('[data-testid="pi-save-config"]').click()
  await expect(page.getByText('Configured')).toBeVisible()

  await exitApp(app)

  app = await launchApp()
  page = await app.firstWindow()
  noteRows = page.locator('[data-testid="note-row"]')
  await expect(noteRows).toHaveCount(2)
  await noteRows.first().click()
  await noteRows.nth(1).click({ modifiers: [modifier] })

  await expect(page.getByRole('button', { name: 'Generate Drafts', exact: true })).toBeEnabled()

  await exitApp(app)
})

test('Agent Runs shows live generation, detail transcript, and source note navigation', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  try {
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

    await expect
      .poll(async () => {
        const runs = await page.evaluate(async () => window.pilog.invoke('agent-runs:list'))
        return runs[0]?.status === 'succeeded' && runs[0]?.outputDraftCount === 1
      })
      .toBe(true)

    await page.locator('[data-testid="open-command"]').click()
    await expect(page.locator('[data-testid="cmd-agent-runs"]')).toBeVisible()
    await page.locator('[data-testid="cmd-agent-runs"]').click()

    const runRows = page.locator('[data-testid="agent-run-row"]')
    await expect(runRows.first()).toContainText('1 drafts')
    await expect(runRows.first()).toContainText('Succeeded')

    await runRows.first().click()
    await expect(page.locator('[data-testid="run-output-draft"]')).toContainText(
      'Triage selected Pilog notes'
    )
    await page.getByRole('tab', { name: /Transcript/ }).click()
    await expect(page.locator('[data-testid="run-event-transcript"]')).toContainText('final')
    await page.getByRole('tab', { name: /Drafts/ }).click()

    await page.locator('[data-testid="run-source-note"]').first().click()
    await expect(page.locator('h1')).toHaveText('Inbox')
    await expect(page.locator('textarea[aria-label="Note content"]')).toHaveValue(
      'settings spacing is odd on mobile'
    )
  } finally {
    await exitApp(app)
  }
})

test('Advanced Turn Budget stops draft generation when exceeded', async () => {
  const app = await launchApp()
  const page = await app.firstWindow()

  await page.evaluate(
    async ({ repoPath }) => {
      await window.pilog.invoke('debug:seedIssueGenerationFixture', {
        repoPath,
        notes: ['force a looping draft generation run']
      })
      await window.pilog.invoke('settings:setAdvanced', { turnBudget: 5 })
      await window.pilog.invoke('setting:set', { key: 'pi.activeModel', value: 'turn-budget-loop' })
    },
    { repoPath: repoDir }
  )
  await page.reload()

  const noteRows = page.locator('[data-testid="note-row"]')
  await expect(noteRows).toHaveCount(1)
  await noteRows.first().click()

  await page.locator('button:has-text("Generate Drafts")').click()

  await expect
    .poll(async () => {
      const runs = await page.evaluate(async () => window.pilog.invoke('agent-runs:list'))
      return runs[0]?.errorCause
    })
    .toBe('turn_budget_exceeded')

  const runs = await page.evaluate(async () => window.pilog.invoke('agent-runs:list'))
  expect(runs[0]?.status).toBe('failed')

  await exitApp(app)
})
