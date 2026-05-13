const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { listPackage } = require('@electron/asar')

const REQUIRED_ASAR_ENTRIES = [
  '/out/main/index.js',
  '/package.json',
  '/node_modules/better-sqlite3/package.json',
  '/node_modules/better-sqlite3/lib/index.js',
  '/node_modules/drizzle-orm/better-sqlite3/index.js',
  '/node_modules/@vscode/ripgrep/lib/index.js'
]

function resolveResourcesDir(appOutDir) {
  const candidates = [join(appOutDir, 'resources'), join(appOutDir, 'Contents', 'Resources')]
  const resourcesDir = candidates.find((candidate) => existsSync(join(candidate, 'app.asar')))

  if (!resourcesDir) {
    throw new Error(
      `Could not find packaged app.asar. Checked: ${candidates
        .map((candidate) => join(candidate, 'app.asar'))
        .join(', ')}`
    )
  }

  return resourcesDir
}

function verifyPackagedRuntime(appOutDir) {
  const resourcesDir = resolveResourcesDir(appOutDir)
  const appAsar = join(resourcesDir, 'app.asar')
  const entries = new Set(listPackage(appAsar))
  const missingEntries = REQUIRED_ASAR_ENTRIES.filter((entry) => !entries.has(entry))
  const sqliteNative = join(
    resourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node'
  )

  if (!existsSync(sqliteNative)) {
    missingEntries.push(sqliteNative)
  }

  if (missingEntries.length > 0) {
    throw new Error(
      `Packaged runtime is missing required files:\n${missingEntries
        .map((entry) => `- ${entry}`)
        .join('\n')}`
    )
  }

  console.log('[verify-packaged-runtime] required runtime files are packaged')
}

async function afterPack(context) {
  verifyPackagedRuntime(context.appOutDir)
}

module.exports = afterPack
module.exports.verifyPackagedRuntime = verifyPackagedRuntime

if (require.main === module) {
  const appOutDir = process.argv[2]

  if (!appOutDir) {
    console.error('Usage: node scripts/verify-packaged-runtime.cjs <appOutDir>')
    process.exit(2)
  }

  verifyPackagedRuntime(appOutDir)
}
