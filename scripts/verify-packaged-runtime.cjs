const { existsSync, mkdtempSync, readdirSync, rmSync, statSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { basename, dirname, join } = require('node:path')
const { spawnSync } = require('node:child_process')
const { listPackage } = require('@electron/asar')
const asar = require('@electron/asar')

const REQUIRED_ASAR_ENTRIES = [
  '/out/main/index.js',
  '/package.json',
  '/node_modules/better-sqlite3/package.json',
  '/node_modules/better-sqlite3/lib/index.js',
  '/node_modules/drizzle-orm/better-sqlite3/index.js',
  '/node_modules/@earendil-works/pi-agent-core/package.json',
  '/node_modules/@earendil-works/pi-ai/package.json',
  '/node_modules/@earendil-works/pi-coding-agent/package.json',
  '/node_modules/@vscode/ripgrep/lib/index.js'
]

const REQUIRED_IMPORTS = [
  '@earendil-works/pi-agent-core',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-coding-agent'
]

const HYGIENE_SOURCE_MAP_ENV = 'PILOG_ALLOW_PACKAGED_SOURCE_MAPS'
const TEST_DIRECTORY_SEGMENTS = new Set(['__tests__', 'tests', 'test'])
const FIXTURE_DIRECTORY_SEGMENTS = new Set(['fixtures', '__fixtures__'])
const DEVELOPMENT_CACHE_SEGMENTS = new Set(['.cache', '.vite', '.turbo'])
const BUILD_LEFTOVER_SEGMENTS = new Set(['coverage', '.nyc_output'])
const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$/

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

function verifyPackagedRuntime(appOutDir, options = {}) {
  enforcePackagedFileHygiene(appOutDir, {
    allowSourceMaps: options.allowSourceMaps ?? process.env[HYGIENE_SOURCE_MAP_ENV] === '1'
  })

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
  const ripgrepBinary = resolveRequiredRipgrepBinary(resourcesDir, {
    arch: options.arch,
    platform: options.platform ?? inferPackagedPlatform(appOutDir)
  })

  if (!existsSync(sqliteNative)) {
    missingEntries.push(sqliteNative)
  }

  if (ripgrepBinary && !existsSync(ripgrepBinary)) {
    missingEntries.push(ripgrepBinary)
  }

  if (missingEntries.length > 0) {
    throw new Error(
      `Packaged runtime is missing required files:\n${missingEntries
        .map((entry) => `- ${entry}`)
        .join('\n')}`
    )
  }

  verifyPackagedImports(appAsar)

  console.log('[verify-packaged-runtime] required runtime files and imports are packaged')
}

function enforcePackagedFileHygiene(appOutDir, options = {}) {
  const violations = findPackagedFileHygieneViolations(appOutDir, options)

  if (violations.length === 0) {
    console.log('[verify-packaged-runtime] packaged file hygiene rules passed')
    return
  }

  const formattedViolations = violations
    .map((violation) => `- ${violation.category}: ${violation.location} ${violation.path}`)
    .join('\n')

  throw new Error(
    [
      'Packaged file hygiene check failed. The packaged app includes files that are not allowed in release artifacts:',
      formattedViolations,
      '',
      'Allowed exceptions remain limited to required runtime dependencies, native bindings, repo-search executables, updater support, and app/tray resources.',
      `Source maps are excluded by packaging config and blocked here unless an intentional diagnostic release also sets ${HYGIENE_SOURCE_MAP_ENV}=1.`
    ].join('\n')
  )
}

function findPackagedFileHygieneViolations(appOutDir, options = {}) {
  const resourcesDir = resolveResourcesDir(appOutDir)
  const appAsar = join(resourcesDir, 'app.asar')
  const violations = []

  for (const entry of listPackage(appAsar)) {
    const comparablePath = normalizeAsarEntry(entry).replace(/^\/+/, '')
    const violation = classifyForbiddenPackagedPath(
      comparablePath,
      `app.asar/${comparablePath}`,
      'asar',
      options
    )
    if (violation) violations.push(violation)
  }

  for (const file of collectPhysicalPackagedFiles(appOutDir)) {
    const normalized = normalizePath(file)
    if (normalized.endsWith('/app.asar') || normalized === 'app.asar') continue

    const violation = classifyForbiddenPackagedPath(normalized, normalized, 'file-system', options)
    if (violation) violations.push(violation)
  }

  return violations.sort(
    (a, b) => a.category.localeCompare(b.category) || a.path.localeCompare(b.path)
  )
}

function collectPhysicalPackagedFiles(rootDir) {
  const files = []

  function visit(currentDir) {
    for (const entry of readdirSync(currentDir)) {
      const fullPath = join(currentDir, entry)
      const info = statSync(fullPath)
      if (info.isDirectory()) {
        visit(fullPath)
        continue
      }
      if (info.isFile()) {
        files.push(normalizePath(fullPath.slice(rootDir.length + 1)))
      }
    }
  }

  visit(rootDir)
  return files
}

function classifyForbiddenPackagedPath(comparablePath, reportPath, location, options) {
  const path = normalizePath(comparablePath)
  const segments = path.split('/')
  const fileName = segments.at(-1) || ''

  if (hasPathSegment(segments, TEST_DIRECTORY_SEGMENTS)) {
    return createHygieneViolation('tests', reportPath, location)
  }

  if (TEST_FILE_PATTERN.test(fileName)) {
    return createHygieneViolation('tests', reportPath, location)
  }

  if (hasPathSegment(segments, FIXTURE_DIRECTORY_SEGMENTS)) {
    return createHygieneViolation('fixtures', reportPath, location)
  }

  if (
    hasPathSegment(segments, DEVELOPMENT_CACHE_SEGMENTS) ||
    path.includes('/node_modules/.cache/')
  ) {
    return createHygieneViolation('development-caches', reportPath, location)
  }

  if (!options.allowSourceMaps && fileName.endsWith('.map')) {
    return createHygieneViolation('source-maps', reportPath, location)
  }

  if (
    fileName.endsWith('.tsbuildinfo') ||
    fileName === '.DS_Store' ||
    fileName === 'Thumbs.db' ||
    hasPathSegment(segments, BUILD_LEFTOVER_SEGMENTS)
  ) {
    return createHygieneViolation('build-leftovers', reportPath, location)
  }

  return null
}

function hasPathSegment(segments, forbiddenSegments) {
  return segments.some((segment) => forbiddenSegments.has(segment))
}

function createHygieneViolation(category, path, location) {
  return { category, path, location }
}

function resolveRequiredRipgrepBinary(resourcesDir, { platform, arch }) {
  const targetArch = arch ?? process.arch
  const packageByPlatform = {
    darwin: {
      arm64: ['@vscode', 'ripgrep-darwin-arm64', 'bin', 'rg'],
      x64: ['@vscode', 'ripgrep-darwin-x64', 'bin', 'rg']
    },
    linux: {
      arm64: ['@vscode', 'ripgrep-linux-arm64', 'bin', 'rg'],
      x64: ['@vscode', 'ripgrep-linux-x64', 'bin', 'rg']
    },
    win32: {
      arm64: ['@vscode', 'ripgrep-win32-arm64', 'bin', 'rg.exe'],
      ia32: ['@vscode', 'ripgrep-win32-ia32', 'bin', 'rg.exe'],
      x64: ['@vscode', 'ripgrep-win32-x64', 'bin', 'rg.exe']
    }
  }
  const packageSegments = packageByPlatform[platform]?.[targetArch]
  if (!packageSegments) return null

  return join(resourcesDir, 'app.asar.unpacked', 'node_modules', ...packageSegments)
}

function inferPackagedPlatform(appOutDir) {
  if (basename(appOutDir).startsWith('win-') || existsSync(join(appOutDir, 'Pilog.exe'))) {
    return 'win32'
  }
  if (basename(appOutDir).startsWith('linux-') || existsSync(join(appOutDir, 'pilog'))) {
    return 'linux'
  }
  if (appOutDir.includes('.app')) {
    return 'darwin'
  }
  return process.platform
}

function verifyPackagedImports(appAsar) {
  const tempDir = mkdtempSync(join(tmpdir(), 'pilog-packaged-runtime-'))

  try {
    asar.extractAll(appAsar, tempDir)
    const script = `
      for (const packageName of ${JSON.stringify(REQUIRED_IMPORTS)}) {
        await import(packageName)
      }
    `
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      cwd: tempDir,
      encoding: 'utf8'
    })

    if (result.error) {
      throw result.error
    }

    if (result.status !== 0) {
      throw new Error(
        `Packaged runtime imports failed:\n${[result.stdout, result.stderr]
          .filter(Boolean)
          .join('\n')
          .trim()}`
      )
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function normalizeAsarEntry(entry) {
  const normalized = normalizePath(entry)
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function normalizePath(path) {
  return path.replaceAll('\\', '/')
}

async function afterPack(context) {
  verifyPackagedRuntime(context.appOutDir, {
    arch: context.arch,
    platform: context.electronPlatformName
  })
}

module.exports = afterPack
module.exports.verifyPackagedRuntime = verifyPackagedRuntime
module.exports.enforcePackagedFileHygiene = enforcePackagedFileHygiene
module.exports.findPackagedFileHygieneViolations = findPackagedFileHygieneViolations

if (require.main === module) {
  const appOutDir = process.argv[2]

  if (!appOutDir) {
    console.error('Usage: node scripts/verify-packaged-runtime.cjs <appOutDir>')
    process.exit(2)
  }

  verifyPackagedRuntime(appOutDir)
}
