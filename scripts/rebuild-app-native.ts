import electronPackage from 'electron/package.json'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const appDir = resolve('app')
const executable = resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild'
)
const result = spawnSync(
  executable,
  [
    '--force',
    '--module-dir',
    '.',
    '--which-module',
    'better-sqlite3',
    '--version',
    electronPackage.version
  ],
  {
    cwd: appDir,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  }
)

if (result.error) {
  throw result.error
}

process.exitCode = result.status ?? 1
