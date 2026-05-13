const { existsSync, readdirSync, statSync } = require('node:fs')
const { dirname, join } = require('node:path')
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

  if (resourcesDir) {
    return resourcesDir
  }

  const nestedAppAsar = findNestedAppAsar(appOutDir)

  if (nestedAppAsar) {
    return dirname(nestedAppAsar)
  }

  throw new Error(
    `Could not find packaged app.asar. Checked: ${candidates
      .map((candidate) => join(candidate, 'app.asar'))
      .join(', ')}`
  )
}

function findNestedAppAsar(rootDir, depth = 0) {
  if (depth > 4 || !existsSync(rootDir)) {
    return null
  }

  for (const entry of readdirSync(rootDir)) {
    const fullPath = join(rootDir, entry)
    if (entry === 'app.asar') {
      return fullPath
    }
    if (statSync(fullPath).isDirectory()) {
      const nested = findNestedAppAsar(fullPath, depth + 1)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

function verifyPackagedRuntime(appOutDir) {
  const resourcesDir = resolveResourcesDir(appOutDir)
  const appAsar = join(resourcesDir, 'app.asar')
  const entries = new Set(listPackage(appAsar).map(normalizeAsarEntry))
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

function normalizeAsarEntry(entry) {
  const normalized = entry.replaceAll('\\', '/')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
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
