import type { Note, Repo } from '@shared/ipc'
import type { GeneratedIssueDraft } from '@shared/types'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const runIfEnabled = process.env.PILOG_INTEGRATION_AGENT === '1' ? describe : describe.skip

runIfEnabled('issue generation integration', () => {
  it('runs the real agent path against the fixture repo and returns Phase 3 draft shape', async () => {
    const repoPath = prepareFixtureRepo()
    const { runAgent } = await import('./runtime')
    const repo: Repo = {
      id: 'fixture-repo',
      owner: 'pilog',
      name: 'fixture',
      localPath: repoPath,
      githubUrl: 'https://github.com/pilog/fixture',
      defaultBranch: 'main',
      githubLabels: [],
      githubLabelsSyncedAt: null,
      autoPublishEnabled: false,
      autoPublishMaxIssuesPerRun: 5,
      autoPublishDefaultLabel: 'triaged-by-pilog',
      autoPublishDryRun: false,
      autoPublishRequireConfirmation: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    const notesFixture = JSON.parse(
      readFileSync(path.join(process.cwd(), 'fixtures', 'agent', 'notes.json'), 'utf8')
    ) as Array<{ id: string; content: string }>
    const notes: Note[] = notesFixture.map((note) => ({
      id: note.id,
      content: note.content,
      status: 'unprocessed',
      repoId: repo.id,
      runId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }))

    const events = runAgent({
      runId: 'integration-run',
      repo,
      notes,
      provider: process.env.PILOG_INTEGRATION_PROVIDER ?? 'anthropic',
      model: process.env.PILOG_INTEGRATION_MODEL ?? 'claude-sonnet-4-5',
      turnBudget: 20
    })

    let drafts: GeneratedIssueDraft[] | undefined
    for await (const event of events) {
      if (event.type === 'final') {
        drafts = event.drafts
        break
      }
      if (event.type === 'error') throw new Error(event.message)
    }

    expect(drafts).toBeDefined()
    expect(drafts!.length).toBeGreaterThanOrEqual(1)
    expect(drafts!.length).toBeLessThanOrEqual(3)
    for (const draft of drafts!) {
      expect(draft.affectedFiles.length).toBeGreaterThan(0)
      expect(draft.acceptanceCriteria.length).toBeGreaterThan(0)
      expect(draft.groupingReason.length).toBeGreaterThan(10)
    }
  })
})

function prepareFixtureRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'pilog-agent-fixture-'))
  const repoPath = path.join(root, 'repo')
  cpSync(path.join(process.cwd(), 'fixtures', 'agent', 'repo'), repoPath, { recursive: true })
  execFileSync('git', ['init', '-b', 'main'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.email', 'pilog@example.com'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.name', 'Pilog'], { cwd: repoPath })
  execFileSync('git', ['add', '.'], { cwd: repoPath })
  execFileSync('git', ['commit', '-m', 'Initial fixture repo'], { cwd: repoPath })
  return repoPath
}
