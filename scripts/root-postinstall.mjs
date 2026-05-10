import { spawnSync } from 'node:child_process'

// Root postinstall: link app deps, then optionally rebuild better-sqlite3 for Electron.
// Sandcastle and other Docker sandboxes set PILOG_SANDBOX=1 to skip app:rebuild so
// install does not require network access to Electron download hosts (electron-rebuild).
const pnpmCommands = [['--dir', 'app', 'install']]

if (!process.env.PILOG_SANDBOX) {
  pnpmCommands.push(['run', 'app:rebuild'])
}

for (const args of pnpmCommands) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit' })
  if (result.status) {
    process.exit(result.status ?? 1)
  }
}
