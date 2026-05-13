import { spawnSync } from 'node:child_process'

// Root postinstall: optionally rebuild better-sqlite3 for Electron.
// Sandcastle and other Docker sandboxes set PILOG_SANDBOX=1 to skip app:rebuild so
// install does not require network access to Electron download hosts (electron-rebuild).
const pnpmCommands = []

if (!process.env.PILOG_SANDBOX) {
  pnpmCommands.push(['run', 'app:rebuild'])
}

const spawnEnv = (() => {
  const env = { ...process.env }
  // Nested `pnpm install` may need to replace app/node_modules; without a TTY it
  // aborts unless CI is set (pnpm docs / ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
  if (!process.stdin.isTTY) {
    env.CI = env.CI || 'true'
  }
  return env
})()

for (const args of pnpmCommands) {
  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    env: spawnEnv,
    shell: process.platform === 'win32'
  })
  if (result.error) {
    throw result.error
  }
  if (result.status) {
    process.exit(result.status ?? 1)
  }
}
