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
    env: { ...process.env, PILOG_USER_DATA: userDataDir, PILOG_DEBUG_IPC: '1' }
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
  await inboxPage.getByRole('button', { name: 'Skip setup for now' }).click()
  await expect(inboxPage.getByRole('button', { name: 'Resume first-run setup' })).toBeVisible()
  await exitApp(app)

  app = await launchApp()
  expect(app.windows().length).toBe(0)
  await exitApp(app)
})

test('tray-first: Open Inbox action shows main window', async () => {
  let app = await launchApp()
  let inboxPage = await app.firstWindow()
  await inboxPage.getByRole('button', { name: 'Skip setup for now' }).click()
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

test('onboarding keeps repository setup inline', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()
  await inboxPage.waitForLoadState('domcontentloaded')

  await inboxPage.evaluate(async () => {
    await window.pilog.invoke('onboarding:set', {
      version: 1,
      skipped: false,
      completed: false,
      confirmedHotkeyAt: '2026-05-10T12:00:00.000Z',
      completedAt: null,
      skippedAt: null
    })
    await window.pilog.invoke('debug:setGitHubAuth', {
      token: 'pilog-e2e-token',
      login: 'pilog-e2e'
    })
  })
  await inboxPage.reload()

  await expect(inboxPage.locator('[data-testid="onboarding-panel"]')).toBeVisible()
  await expect(inboxPage.locator('[data-testid="onboarding-step-repo"]')).toHaveAttribute(
    'aria-current',
    'step'
  )
  await expect(inboxPage.getByRole('button', { name: 'Link a local repo' })).toBeVisible()
  await expect(inboxPage.locator('h1')).toHaveText('Inbox')

  await exitApp(app)
})

test('onboarding saves Pi setup inline and advances', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()
  await inboxPage.waitForLoadState('domcontentloaded')

  const repoDir = mkdtempSync(join(tmpdir(), 'pilog-onboarding-repo-'))
  try {
    await inboxPage.evaluate(
      async ({ repoPath }) => {
        await window.pilog.invoke('onboarding:set', {
          version: 1,
          skipped: false,
          completed: false,
          confirmedHotkeyAt: '2026-05-10T12:00:00.000Z',
          completedAt: null,
          skippedAt: null
        })
        await window.pilog.invoke('debug:setGitHubAuth', {
          token: 'pilog-e2e-token',
          login: 'pilog-e2e'
        })
        await window.pilog.invoke('debug:seedIssueGenerationFixture', {
          repoPath,
          notes: []
        })
        await window.pilog.invoke('pi:resetConfig')
      },
      { repoPath: repoDir }
    )
    await inboxPage.reload()

    await expect(inboxPage.locator('[data-testid="onboarding-step-pi"]')).toHaveAttribute(
      'aria-current',
      'step'
    )
    await expect(inboxPage.locator('[data-testid="pi-config-panel"]')).toBeVisible()
    await inboxPage.locator('[data-testid="pi-api-key-input"]').fill('sk-e2e-test')
    await inboxPage.locator('[data-testid="pi-save-config"]').click()

    await expect(inboxPage.locator('[data-testid="onboarding-step-note"]')).toHaveAttribute(
      'aria-current',
      'step'
    )
  } finally {
    rmSync(repoDir, { recursive: true, force: true })
    await exitApp(app)
  }
})

test('onboarding captures a note and shows the first draft preview inline', async () => {
  const app = await launchApp()
  const inboxPage = await app.firstWindow()
  await inboxPage.waitForLoadState('domcontentloaded')

  const repoDir = mkdtempSync(join(tmpdir(), 'pilog-onboarding-draft-repo-'))
  try {
    await inboxPage.evaluate(
      async ({ repoPath }) => {
        await window.pilog.invoke('onboarding:set', {
          version: 1,
          skipped: false,
          completed: false,
          confirmedHotkeyAt: '2026-05-10T12:00:00.000Z',
          completedAt: null,
          skippedAt: null
        })
        await window.pilog.invoke('debug:setGitHubAuth', {
          token: 'pilog-e2e-token',
          login: 'pilog-e2e'
        })
        await window.pilog.invoke('debug:seedIssueGenerationFixture', {
          repoPath,
          notes: []
        })
      },
      { repoPath: repoDir }
    )
    await inboxPage.reload()

    await expect(inboxPage.locator('[data-testid="onboarding-step-note"]')).toHaveAttribute(
      'aria-current',
      'step'
    )
    await inboxPage
      .locator('[data-testid="onboarding-note-input"]')
      .fill('The settings save button needs a loading state while Pi config is being stored.')
    await inboxPage.getByRole('button', { name: 'Save note' }).click()

    await expect(inboxPage.locator('[data-testid="onboarding-step-draft"]')).toHaveAttribute(
      'aria-current',
      'step'
    )
    await inboxPage.getByRole('button', { name: 'Generate first draft' }).click()

    await expect(inboxPage.getByText('Generating draft')).toBeVisible()
    await expect(inboxPage.locator('[data-testid="onboarding-step-review"]')).toHaveAttribute(
      'aria-current',
      'step',
      { timeout: 20_000 }
    )
    await expect(inboxPage.getByRole('button', { name: 'Open full draft' })).toBeVisible()
  } finally {
    rmSync(repoDir, { recursive: true, force: true })
    await exitApp(app)
  }
})
