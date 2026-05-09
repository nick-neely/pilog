/**
 * Root postinstall: link app deps, then optionally rebuild better-sqlite3 for Electron.
 * Sandcastle and other Docker sandboxes set PILOG_SANDBOX=1 to skip app:rebuild so
 * install does not require network access to electronjs.org (electron-rebuild).
 */
const { spawnSync } = require('node:child_process')

function runPnpm(args) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit', shell: true })
  if (result.status) {
    process.exit(result.status ?? 1)
  }
}

runPnpm(['--dir', 'app', 'install'])

if (!process.env.PILOG_SANDBOX) {
  runPnpm(['run', 'app:rebuild'])
}
