// Parallel Planner with Review — four-phase orchestration loop
//
// This template drives a multi-phase workflow:
//   Phase 1 (Plan):             A Sonnet agent analyzes open issues, builds a
//                               dependency graph, and outputs a <plan> JSON
//                               listing unblocked issues with branch names.
//   Phase 2 (Execute + Review): For each issue, a sandbox is created via
//                               createSandbox(). The implementer runs first
//                               (100 iterations). If it produces commits, a
//                               reviewer runs in the same sandbox on the same
//                               branch (1 iteration). All issue pipelines run
//                               concurrently via Promise.allSettled().
//   Phase 3 (Merge):            A single agent merges all completed branches
//                               into the current branch.
//
// The outer loop repeats up to MAX_ITERATIONS times so that newly unblocked
// issues are picked up after each round of merges.
//
// Usage:
//   npx tsx .sandcastle/main.mts
//     Claude Code via ANTHROPIC_API_KEY (default).
//   npx tsx .sandcastle/main.mts --codex
//     OpenAI Codex CLI with subscription auth from host ~/.codex (see .env.example).
// Or add to package.json:
//   "scripts": { "sandcastle": "npx tsx .sandcastle/main.mts" }

import type { AgentProvider, SandboxProvider } from '@ai-hero/sandcastle'
import * as sandcastle from '@ai-hero/sandcastle'
import { docker } from '@ai-hero/sandcastle/sandboxes/docker'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Agent mode: Claude Code (API key) vs Codex (host ~/.codex subscription auth)
// ---------------------------------------------------------------------------

const useCodex = process.argv.includes('--codex')

/** Codex model string passed to sandcastle.codex(); adjust if you prefer another tier. */
const CODEX_MODEL = 'gpt-5.5'

const CLAUDE_MODELS = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6'
} as const

type ClaudeModelRole = keyof typeof CLAUDE_MODELS

/** Copy mounted host ~/.codex into the path Codex expects inside the sandbox (subscription login workaround). */
const CODEX_AUTH_HOOK =
  'rm -rf /home/agent/.codex && mkdir -p /home/agent/.codex && ' +
  'for item in auth.json config.toml AGENTS.md rules; do ' +
  'if [ -e "/home/agent/.codex-host/$item" ]; then cp -R "/home/agent/.codex-host/$item" /home/agent/.codex/; fi; done && ' +
  'chmod -R u+rwX /home/agent/.codex'

function agent(model: ClaudeModelRole = 'sonnet'): AgentProvider {
  return useCodex ? sandcastle.codex(CODEX_MODEL) : sandcastle.claudeCode(CLAUDE_MODELS[model])
}

function skillMounts(): Array<{ hostPath: string; sandboxPath: string; readonly: true }> {
  const mounts: Array<{ hostPath: string; sandboxPath: string; readonly: true }> = []
  const hostHome = homedir()

  // Claude Code skills.
  if (existsSync(join(hostHome, '.claude/skills'))) {
    mounts.push({
      hostPath: '~/.claude/skills',
      sandboxPath: '/home/agent/.claude/skills',
      readonly: true
    })
  }

  // Codex/agents skills.
  if (existsSync(join(hostHome, '.agents/skills'))) {
    mounts.push({
      hostPath: '~/.agents/skills',
      sandboxPath: '/home/agent/.agents/skills',
      readonly: true
    })
  }

  return mounts
}

function sandboxProvider(): SandboxProvider {
  const sharedMounts = skillMounts()

  if (useCodex) {
    return docker({
      mounts: [
        {
          hostPath: '~/.codex',
          sandboxPath: '/home/agent/.codex-host',
          readonly: true
        },
        ...sharedMounts
      ]
    })
  }

  // Expose host skills for both Claude Code and Codex/agents paths. Any
  // missing host directory is skipped to avoid failing sandbox startup.
  return docker({
    mounts: sharedMounts
  })
}

// Hooks run inside the sandbox before the agent starts each iteration.
// CI=true: pnpm refuses to alter node_modules without a TTY unless CI is set
// (Sandcastle uses `docker exec … sh -c`, which is non-interactive).
// PILOG_SANDBOX=1: skip Electron native rebuild (electron-rebuild → electronjs.org);
// agents only need linked deps; host `node_modules` copy covers most binaries.
// Codex: copy subscription auth from read-only mount before install.
const hooks = {
  sandbox: {
    onSandboxReady: [
      ...(useCodex ? [{ command: CODEX_AUTH_HOOK }] : []),
      { command: 'CI=true PILOG_SANDBOX=1 pnpm install', timeoutMs: 300_000 }
    ]
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Maximum number of plan→execute→merge cycles before stopping.
// Raise this if your backlog is large; lower it for a quick smoke-test run.
const MAX_ITERATIONS = 10

// Copy node_modules from the host into the worktree before each sandbox
// starts. With pnpm, packages and the virtual store live under node_modules
// (including node_modules/.pnpm). Avoids a cold install; the hook above is
// the safety net for platform-specific binaries.
const copyToWorktree = ['node_modules', 'app/node_modules']

type PlannedIssue = {
  id: string
  title: string
  branch: string
  implementationModel?: string
  implementationModelReason?: string
}

function implementationModelFor(issue: PlannedIssue): ClaudeModelRole {
  return issue.implementationModel === 'opus' ? 'opus' : 'sonnet'
}

function executionModelLabel(issue: PlannedIssue): string {
  if (useCodex) {
    return CODEX_MODEL
  }
  return implementationModelFor(issue)
}

/**
 * Lists `ready-for-agent` issues on the **host** via `gh` and returns JSON.
 * The plan prompt used to run this inside the sandbox with `!`shell`; Sandcastle
 * applies a 30s timeout there, which breaks when GitHub is slow or the payload
 * (especially all comment bodies) is large.
 */
function fetchReadyForAgentIssuesJson(): string {
  try {
    return execFileSync(
      'gh',
      [
        'issue',
        'list',
        '--state',
        'open',
        '--label',
        'ready-for-agent',
        '--json',
        'number,title,body,labels'
      ],
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    ).trim()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Sandcastle planner could not list GitHub issues via \`gh\` on the host. ` +
        `Install the GitHub CLI, run \`gh auth login\`, and use this command from the repo root.\n${msg}`
    )
  }
}

function needsOpusForMerge(branches: string[]): boolean {
  if (branches.length === 0) {
    return false
  }

  const probeDir = mkdtempSync(join(tmpdir(), 'sandcastle-merge-probe-'))
  const probeEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? 'Sandcastle Merge Probe',
    GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? 'sandcastle-merge-probe@example.invalid',
    GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? 'Sandcastle Merge Probe',
    GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? 'sandcastle-merge-probe@example.invalid'
  }

  try {
    execFileSync('git', ['worktree', 'add', '--detach', probeDir, 'HEAD'], { stdio: 'pipe' })

    for (const branch of branches) {
      try {
        execFileSync('git', ['merge', '--no-edit', branch], {
          cwd: probeDir,
          env: probeEnv,
          stdio: 'pipe'
        })
      } catch {
        if (useCodex) {
          console.log(
            `Merge preflight found conflicts while checking ${branch}; continuing with ${CODEX_MODEL}.`
          )
        } else {
          console.log(`Merge preflight found conflicts while checking ${branch}; using Opus.`)
        }
        return true
      }
    }

    return false
  } catch {
    if (useCodex) {
      console.log(`Merge preflight could not complete cleanly; continuing with ${CODEX_MODEL}.`)
    } else {
      console.log('Merge preflight could not complete cleanly; using Opus.')
    }
    return true
  } finally {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', probeDir], { stdio: 'pipe' })
    } catch {
      rmSync(probeDir, { recursive: true, force: true })
    }
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  console.log(`\n=== Iteration ${iteration}/${MAX_ITERATIONS} ===\n`)

  // -------------------------------------------------------------------------
  // Phase 1: Plan
  //
  // The planning agent reads the open issue list,
  // builds a dependency graph, and selects the issues that can be worked in
  // parallel right now (i.e., no blocking dependencies on other open issues).
  //
  // It outputs a <plan> JSON block — we parse that to drive Phase 2.
  // -------------------------------------------------------------------------
  const issuesJson = fetchReadyForAgentIssuesJson()
  const plan = await sandcastle.run({
    hooks,
    sandbox: sandboxProvider(),
    name: 'planner',
    // One iteration is enough: the planner just needs to read and reason,
    // not write code.
    maxIterations: 1,
    agent: agent('sonnet'),
    promptFile: './.sandcastle/plan-prompt.md',
    promptArgs: {
      ISSUES_JSON: issuesJson,
      IMPLEMENTATION_SELECTION_POLICY: useCodex
        ? `Set "implementationModel" to "${CODEX_MODEL}" for every issue (single-model Codex mode).`
        : 'Use "sonnet" by default. Use "opus" only when the issue is architecturally risky, cross-cutting, security-sensitive, likely to touch unfamiliar core abstractions, likely to require a data migration, or explicitly asks for deeper implementation reasoning.',
      PLAN_OUTPUT_EXAMPLE: useCodex
        ? `{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42-fix-auth-bug", "implementationModel": "${CODEX_MODEL}", "implementationModelReason": "Codex single-model mode for this run."}]}`
        : '{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42-fix-auth-bug", "implementationModel": "sonnet", "implementationModelReason": "Small localized bug fix."}]}'
    }
  })

  // Extract the <plan>…</plan> block from the agent's stdout.
  const planMatch = plan.stdout.match(/<plan>([\s\S]*?)<\/plan>/)
  if (!planMatch) {
    throw new Error('Planning agent did not produce a <plan> tag.\n\n' + plan.stdout)
  }

  // The plan JSON contains an array of issues, each with id, title, branch.
  const { issues } = JSON.parse(planMatch[1]!) as { issues: PlannedIssue[] }

  if (issues.length === 0) {
    // No unblocked work — either everything is done or everything is blocked.
    console.log('No unblocked issues to work on. Exiting.')
    break
  }

  console.log(`Planning complete. ${issues.length} issue(s) to work in parallel:`)
  for (const issue of issues) {
    const modelLabel = executionModelLabel(issue)
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch} (${modelLabel})`)
  }

  // -------------------------------------------------------------------------
  // Phase 2: Execute + Review
  //
  // For each issue, create a sandbox via createSandbox() so the implementer
  // and reviewer share the same sandbox instance per branch. The implementer
  // runs first; if it produces commits, the reviewer runs in the same sandbox.
  //
  // Promise.allSettled means one failing pipeline doesn't cancel the others.
  // -------------------------------------------------------------------------

  const settled = await Promise.allSettled(
    issues.map(async (issue) => {
      const sandbox = await sandcastle.createSandbox({
        branch: issue.branch,
        sandbox: sandboxProvider(),
        hooks,
        copyToWorktree
      })

      try {
        // Run the implementer
        const implementationModel = implementationModelFor(issue)
        const implementationModelLabel = executionModelLabel(issue)
        const implementationModelReason = useCodex
          ? `Codex mode uses a single model (${CODEX_MODEL}) for implementation and review.`
          : (issue.implementationModelReason ?? 'Default implementation model.')
        const implement = await sandbox.run({
          name: 'implementer',
          maxIterations: 100,
          agent: agent(implementationModel),
          promptFile: './.sandcastle/implement-prompt.md',
          promptArgs: {
            TASK_ID: issue.id,
            ISSUE_TITLE: issue.title,
            BRANCH: issue.branch,
            IMPLEMENTATION_MODEL: implementationModelLabel,
            IMPLEMENTATION_MODEL_REASON: implementationModelReason
          }
        })

        // Only review if the implementer produced commits
        if (implement.commits.length > 0) {
          const review = await sandbox.run({
            name: 'reviewer',
            maxIterations: 1,
            agent: agent('opus'),
            promptFile: './.sandcastle/review-prompt.md',
            promptArgs: {
              BRANCH: issue.branch
            }
          })

          // Merge commits from both runs so the merge phase sees all of them.
          // Each sandbox.run() only returns commits from its own run.
          return {
            ...review,
            commits: [...implement.commits, ...review.commits]
          }
        }

        return implement
      } finally {
        await sandbox.close()
      }
    })
  )

  // Log any agents that threw (network error, sandbox crash, etc.).
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === 'rejected') {
      console.error(`  ✗ ${issues[i]!.id} (${issues[i]!.branch}) failed: ${outcome.reason}`)
    }
  }

  // Only pass branches that actually produced commits to the merge phase.
  // An agent that ran successfully but made no commits has nothing to merge.
  const completedIssues = settled
    .map((outcome, i) => ({ outcome, issue: issues[i]! }))
    .filter(
      (entry) => entry.outcome.status === 'fulfilled' && entry.outcome.value.commits.length > 0
    )
    .map((entry) => entry.issue)

  const completedBranches = completedIssues.map((i) => i.branch)

  console.log(`\nExecution complete. ${completedBranches.length} branch(es) with commits:`)
  for (const branch of completedBranches) {
    console.log(`  ${branch}`)
  }

  if (completedBranches.length === 0) {
    // All agents ran but none made commits — nothing to merge this cycle.
    console.log('No commits produced. Nothing to merge.')
    continue
  }

  // -------------------------------------------------------------------------
  // Phase 3: Merge
  //
  // One agent merges all completed branches into the current branch,
  // resolving any conflicts and running tests to confirm everything works.
  //
  // The {{BRANCHES}} and {{ISSUES}} prompt arguments are lists that the agent
  // uses to know which branches to merge and which issues to close.
  // -------------------------------------------------------------------------
  const mergeModel = needsOpusForMerge(completedBranches) ? 'opus' : 'sonnet'

  await sandcastle.run({
    hooks,
    sandbox: sandboxProvider(),
    name: 'merger',
    maxIterations: 1,
    agent: agent(mergeModel),
    promptFile: './.sandcastle/merge-prompt.md',
    promptArgs: {
      // A markdown list of branch names, one per line.
      BRANCHES: completedBranches.map((b) => `- ${b}`).join('\n'),
      // A markdown list of issue IDs and titles, one per line.
      ISSUES: completedIssues.map((i) => `- ${i.id}: ${i.title}`).join('\n')
    }
  })

  console.log('\nBranches merged.')
}

console.log('\nAll done.')
