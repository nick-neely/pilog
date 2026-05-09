import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let userDataDir: string
let repoDir: string

const githubToken =
  process.env.PILOG_E2E_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
const githubRepoFullName = process.env.PILOG_E2E_GITHUB_REPO
const githubRepo = parseGitHubRepo(githubRepoFullName)

test.skip(
  !githubToken || !githubRepoFullName,
  'Set PILOG_E2E_GITHUB_TOKEN and PILOG_E2E_GITHUB_REPO=owner/repo to run the live publish e2e.'
)
test.skip(
  Boolean(githubRepoFullName) && !githubRepo,
  'PILOG_E2E_GITHUB_REPO must use owner/repo format for the live publish e2e.'
)

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseGitHubRepo(value: string | undefined): { owner: string; name: string } | null {
  if (!value) return null

  const [owner, name, extra] = value.split('/')
  if (!owner || !name || extra) return null

  return { owner, name }
}

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

async function exitApp(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app }) => app.exit(0))
}

test('Review Mode publishes an edited generated draft and stores the GitHub issue URL', async () => {
  test.setTimeout(60000)
  if (!githubToken || !githubRepo) throw new Error('Live GitHub e2e prerequisites were not loaded.')

  const app = await launchApp()
  try {
    const page = await app.firstWindow()

    await page.evaluate(
      async ({ repoPath, owner, repo, token }) => {
        await window.pilog.invoke('debug:setGitHubAuth', {
          token,
          login: 'pilog-e2e'
        })
        await window.pilog.invoke('debug:seedIssueGenerationFixture', {
          repoPath,
          githubOwner: owner,
          githubRepo: repo,
          notes: [
            'review mode publish e2e: save button needs loading state',
            'review mode publish e2e: settings spacing is odd on mobile'
          ]
        })
      },
      { repoPath: repoDir, owner: githubRepo.owner, repo: githubRepo.name, token: githubToken }
    )
    await page.reload()

    const noteRows = page.locator('[data-testid="note-row"]')
    await expect(noteRows).toHaveCount(2)
    await noteRows.first().click()
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await noteRows.nth(1).click({ modifiers: [modifier] })

    await page.getByRole('button', { name: 'Generate Drafts', exact: true }).click()

    await expect
      .poll(async () => page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts')))
      .toHaveLength(1)

    await page.locator('[data-testid="view-tab-drafts-trigger"]').click()
    await page.locator('[data-testid="draft-row"]').first().click()
    await expect(page.getByRole('heading', { name: 'Draft Review' })).toBeVisible()

    const uniqueSuffix = Date.now().toString(36)
    const editedTitle = `PiLog e2e review publish ${uniqueSuffix}`
    const editedCriterion = `Stores returned GitHub issue URL (${uniqueSuffix})`

    await page.getByLabel('Draft title').fill(editedTitle)
    await page.getByLabel('Labels').fill('')
    await page.getByLabel('Acceptance Criteria').fill(editedCriterion)
    await page.getByRole('button', { name: 'Save' }).click()

    await expect
      .poll(async () => {
        const drafts = await page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts'))
        return {
          title: drafts[0]?.title,
          body: drafts[0]?.body
        }
      })
      .toMatchObject({
        title: editedTitle,
        body: expect.stringContaining(editedCriterion)
      })

    await page.getByRole('button', { name: 'Publish' }).click()

    await expect
      .poll(async () => {
        const drafts = await page.evaluate(async () => window.pilog.invoke('debug:listIssueDrafts'))
        return drafts[0]
      })
      .toMatchObject({
        title: editedTitle,
        status: 'published',
        githubIssueUrl: expect.stringMatching(
          new RegExp(
            `^https://github\\.com/${escapeRegExp(githubRepo.owner)}/${escapeRegExp(
              githubRepo.name
            )}/issues/\\d+$`
          )
        )
      })

    const [publishedDraft] = await page.evaluate(async () =>
      window.pilog.invoke('debug:listIssueDrafts')
    )
    expect(publishedDraft.body).toContain(editedCriterion)
    await expect(page.getByText(/Published to https:\/\/github\.com\//)).toBeVisible()
  } finally {
    await exitApp(app)
  }
})
