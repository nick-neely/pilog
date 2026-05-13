import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar') as {
  listPackage(archive: string): string[]
}

export type InventoryLocation =
  | 'asar'
  | 'asar-unpacked'
  | 'file-system'
  | 'electron-runtime'
  | 'missing'

export interface PackagedArtifactInventoryOptions {
  allowSourceMaps?: boolean
  largestCount?: number
}

export interface InventoryPathSummary {
  path: string
  sizeBytes: number
}

export interface NativeOrExecutablePayload extends InventoryPathSummary {
  reason: 'native-module' | 'windows-executable' | 'executable-bit'
}

export interface ForbiddenFinding {
  category: 'tests' | 'fixtures' | 'development-caches' | 'source-maps' | 'build-leftovers'
  path: string
  location: InventoryLocation
}

export interface RuntimeDependencySummary {
  name: string
  present: boolean
  location: InventoryLocation
  path: string | null
  purpose: string
}

export interface RequiredRuntimeAssetSummary {
  id: string
  label: string
  present: boolean
  location: InventoryLocation
  path: string | null
}

export interface PackagedArtifactInventory {
  appOutDir: string
  resourcesDir: string
  totalSizeBytes: number
  fileCount: number
  directoryCount: number
  largestFiles: InventoryPathSummary[]
  largestDirectories: InventoryPathSummary[]
  asar: {
    path: string
    archiveSizeBytes: number
    entryCount: number
    unpackedPath: string
    unpackedSizeBytes: number
    unpackedFileCount: number
  }
  nativeAndExecutablePayloads: NativeOrExecutablePayload[]
  forbiddenFindings: ForbiddenFinding[]
  runtimeDependencies: RuntimeDependencySummary[]
  requiredRuntimeAssets: RequiredRuntimeAssetSummary[]
}

interface PhysicalFile {
  absolutePath: string
  relativePath: string
  sizeBytes: number
  mode: number
}

interface DirectorySize {
  path: string
  sizeBytes: number
}

interface LocatedPackagedPath {
  location: InventoryLocation
  path: string | null
}

const RUNTIME_DEPENDENCIES: Array<{
  name: string
  purpose: string
}> = [
  { name: 'better-sqlite3', purpose: 'SQLite database native adapter' },
  { name: 'drizzle-orm', purpose: 'SQLite query layer' },
  { name: '@earendil-works/pi-agent-core', purpose: 'Pi agent runtime' },
  { name: '@earendil-works/pi-ai', purpose: 'Pi model/provider runtime' },
  { name: '@earendil-works/pi-coding-agent', purpose: 'Issue draft generation runtime' },
  { name: '@vscode/ripgrep', purpose: 'Repository search tooling' },
  { name: 'simple-git', purpose: 'Linked repository metadata access' },
  { name: 'electron-updater', purpose: 'App update channel support' },
  { name: 'electron.safeStorage', purpose: 'OS secure-storage behavior dependency' }
]

const REQUIRED_RUNTIME_ASSETS: Array<{
  id: string
  label: string
  candidates: string[]
}> = [
  {
    id: 'sqlite-native',
    label: 'better-sqlite3 native binding',
    candidates: ['app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node']
  },
  {
    id: 'repo-search-ripgrep',
    label: 'ripgrep executable for repo search',
    candidates: [
      'app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg',
      'app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg.exe',
      'app.asar.unpacked/node_modules/@vscode/ripgrep-linux-x64/bin/rg',
      'app.asar.unpacked/node_modules/@vscode/ripgrep-linux-arm64/bin/rg',
      'app.asar.unpacked/node_modules/@vscode/ripgrep-darwin-x64/bin/rg',
      'app.asar.unpacked/node_modules/@vscode/ripgrep-darwin-arm64/bin/rg',
      'app.asar.unpacked/node_modules/@vscode/ripgrep-win32-x64/bin/rg.exe',
      'app.asar.unpacked/node_modules/@vscode/ripgrep-win32-arm64/bin/rg.exe',
      'app.asar.unpacked/node_modules/@vscode/ripgrep-win32-ia32/bin/rg.exe'
    ]
  },
  {
    id: 'app-icon',
    label: 'app identity icon',
    candidates: ['resources/icon.png', 'app.asar/resources/icon.png']
  },
  {
    id: 'tray-icon',
    label: 'tray resource',
    candidates: ['resources/tray-icon.png', 'app.asar/resources/tray-icon.png']
  },
  {
    id: 'updater-package',
    label: 'electron-updater package',
    candidates: ['app.asar/node_modules/electron-updater/package.json']
  },
  {
    id: 'pi-runtime',
    label: 'Pi runtime packages',
    candidates: [
      'app.asar/node_modules/@earendil-works/pi-agent-core/package.json',
      'app.asar/node_modules/@earendil-works/pi-ai/package.json',
      'app.asar/node_modules/@earendil-works/pi-coding-agent/package.json'
    ]
  }
]

export function resolvePackagedAppOutDir(inputPath = 'dist'): string {
  const absoluteInput = resolve(inputPath)
  if (basename(absoluteInput).endsWith('.app')) {
    return absoluteInput
  }

  if (existsSync(join(absoluteInput, 'resources', 'app.asar'))) {
    return absoluteInput
  }
  if (existsSync(join(absoluteInput, 'Contents', 'Resources', 'app.asar'))) {
    return absoluteInput
  }

  return resolveDefaultPlatformAppOutDir(absoluteInput)
}

export async function collectPackagedArtifactInventory(
  appOutDir: string,
  options: PackagedArtifactInventoryOptions = {}
): Promise<PackagedArtifactInventory> {
  const resolvedAppOutDir = resolve(appOutDir)
  const largestCount = options.largestCount ?? 20
  const resourcesDir = resolveResourcesDir(resolvedAppOutDir)
  const appAsar = join(resourcesDir, 'app.asar')
  const unpackedDir = join(resourcesDir, 'app.asar.unpacked')
  const asarEntries = new Set(asar.listPackage(appAsar).map(normalizeAsarEntry))
  const physicalFiles = await collectPhysicalFiles(resolvedAppOutDir)
  const directorySizes = collectDirectorySizes(physicalFiles)
  const unpackedFiles = physicalFiles.filter((file) =>
    file.relativePath.startsWith(normalizePath(relative(resolvedAppOutDir, unpackedDir)) + '/')
  )
  const asarArchive = physicalFiles.find(
    (file) => file.absolutePath === appAsar || file.relativePath.endsWith('/app.asar')
  )

  return {
    appOutDir: resolvedAppOutDir,
    resourcesDir,
    totalSizeBytes: sumSizes(physicalFiles),
    fileCount: physicalFiles.length,
    directoryCount: directorySizes.length,
    largestFiles: physicalFiles
      .map(({ relativePath, sizeBytes }) => ({ path: relativePath, sizeBytes }))
      .sort(sortBySizeThenPath)
      .slice(0, largestCount),
    largestDirectories: directorySizes.sort(sortBySizeThenPath).slice(0, largestCount),
    asar: {
      path: normalizePath(relative(resolvedAppOutDir, appAsar)),
      archiveSizeBytes: asarArchive?.sizeBytes ?? 0,
      entryCount: asarEntries.size,
      unpackedPath: normalizePath(relative(resolvedAppOutDir, unpackedDir)),
      unpackedSizeBytes: sumSizes(unpackedFiles),
      unpackedFileCount: unpackedFiles.length
    },
    nativeAndExecutablePayloads: findNativeAndExecutablePayloads(physicalFiles),
    forbiddenFindings: findForbiddenFindings(physicalFiles, asarEntries, options),
    runtimeDependencies: summarizeRuntimeDependencies(asarEntries, physicalFiles, resourcesDir),
    requiredRuntimeAssets: summarizeRequiredRuntimeAssets(asarEntries, physicalFiles, resourcesDir)
  }
}

export function formatPackagedArtifactInventory(inventory: PackagedArtifactInventory): string {
  const lines = [
    'Packaged Artifact Inventory',
    `App output: ${inventory.appOutDir}`,
    `Total unpacked size: ${formatBytes(inventory.totalSizeBytes)} (${inventory.fileCount} files)`,
    '',
    'Asar breakdown',
    `- ${inventory.asar.path}: ${formatBytes(inventory.asar.archiveSizeBytes)} (${inventory.asar.entryCount} entries)`,
    `- ${inventory.asar.unpackedPath}: ${formatBytes(inventory.asar.unpackedSizeBytes)} (${inventory.asar.unpackedFileCount} files)`,
    '',
    'Largest files',
    ...formatPathList(inventory.largestFiles),
    '',
    'Largest directories',
    ...formatPathList(inventory.largestDirectories),
    '',
    'Native and executable payloads',
    ...formatPayloads(inventory.nativeAndExecutablePayloads),
    '',
    'Runtime dependencies',
    ...inventory.runtimeDependencies.map((dependency) => {
      const status = dependency.present ? 'present' : 'missing'
      return `- ${dependency.name}: ${status} (${dependency.location})${dependency.path ? ` ${dependency.path}` : ''}`
    }),
    '',
    'Required runtime assets',
    ...inventory.requiredRuntimeAssets.map((asset) => {
      const status = asset.present ? 'present' : 'missing'
      return `- ${asset.label}: ${status}${asset.path ? ` ${asset.path}` : ''}`
    }),
    '',
    'Forbidden findings',
    ...(inventory.forbiddenFindings.length === 0
      ? ['- none']
      : inventory.forbiddenFindings.map(
          (finding) => `- ${finding.category}: ${finding.location} ${finding.path}`
        ))
  ]

  return `${lines.join('\n')}\n`
}

export function parseInventoryCliArgs(args: string[]): {
  inputPath: string
  allowSourceMaps: boolean
} {
  return {
    inputPath: args.find((arg) => !arg.startsWith('-')) ?? 'dist',
    allowSourceMaps: args.includes('--allow-source-maps')
  }
}

function resolveResourcesDir(appOutDir: string): string {
  const candidates = [join(appOutDir, 'resources'), join(appOutDir, 'Contents', 'Resources')]
  const resourcesDir = candidates.find((candidate) => existsSync(join(candidate, 'app.asar')))
  if (resourcesDir) return resourcesDir

  throw new Error(
    `Could not find packaged app.asar. Checked: ${candidates
      .map((candidate) => join(candidate, 'app.asar'))
      .join(', ')}`
  )
}

function resolveDefaultPlatformAppOutDir(distDir: string): string {
  if (process.platform === 'win32') {
    return join(distDir, 'win-unpacked')
  }

  if (process.platform === 'darwin') {
    return join(distDir, 'mac', 'Pilog.app')
  }

  return join(distDir, 'linux-unpacked')
}

async function collectPhysicalFiles(rootDir: string): Promise<PhysicalFile[]> {
  const files: PhysicalFile[] = []

  async function visit(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!entry.isFile()) continue

      const info = await stat(absolutePath)
      files.push({
        absolutePath,
        relativePath: normalizePath(relative(rootDir, absolutePath)),
        sizeBytes: info.size,
        mode: info.mode
      })
    }
  }

  await visit(rootDir)
  return files
}

function collectDirectorySizes(files: PhysicalFile[]): DirectorySize[] {
  const sizes = new Map<string, number>()

  for (const file of files) {
    const segments = file.relativePath.split('/')
    for (let index = 1; index < segments.length; index += 1) {
      const directory = segments.slice(0, index).join('/')
      sizes.set(directory, (sizes.get(directory) ?? 0) + file.sizeBytes)
    }
  }

  return Array.from(sizes.entries()).map(([path, sizeBytes]) => ({ path, sizeBytes }))
}

function findNativeAndExecutablePayloads(files: PhysicalFile[]): NativeOrExecutablePayload[] {
  return files
    .map((file): NativeOrExecutablePayload | null => {
      if (file.relativePath.endsWith('.node')) {
        return { path: file.relativePath, sizeBytes: file.sizeBytes, reason: 'native-module' }
      }
      if (file.relativePath.endsWith('.exe')) {
        return { path: file.relativePath, sizeBytes: file.sizeBytes, reason: 'windows-executable' }
      }
      if ((file.mode & 0o111) !== 0 && !file.relativePath.endsWith('.asar')) {
        return { path: file.relativePath, sizeBytes: file.sizeBytes, reason: 'executable-bit' }
      }
      return null
    })
    .filter((payload): payload is NativeOrExecutablePayload => payload !== null)
    .sort(sortBySizeThenPath)
}

function findForbiddenFindings(
  physicalFiles: PhysicalFile[],
  asarEntries: Set<string>,
  options: PackagedArtifactInventoryOptions
): ForbiddenFinding[] {
  const findings: ForbiddenFinding[] = []

  for (const file of physicalFiles) {
    const finding = classifyForbiddenPath(
      file.relativePath,
      file.relativePath,
      'file-system',
      options
    )
    if (finding) findings.push(finding)
  }

  for (const entry of asarEntries) {
    const path = entry.replace(/^\/+/, '')
    const finding = classifyForbiddenPath(path, `app.asar/${path}`, 'asar', options)
    if (finding) findings.push(finding)
  }

  return findings.sort(
    (a, b) => a.category.localeCompare(b.category) || a.path.localeCompare(b.path)
  )
}

function classifyForbiddenPath(
  comparablePath: string,
  reportPath: string,
  location: InventoryLocation,
  options: PackagedArtifactInventoryOptions
): ForbiddenFinding | null {
  const path = normalizePath(comparablePath)
  const segments = path.split('/')
  const fileName = segments.at(-1) ?? ''

  if (
    segments.some((segment) => segment === '__tests__' || segment === 'tests' || segment === 'test')
  ) {
    return { category: 'tests', path: reportPath, location }
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(fileName)) {
    return { category: 'tests', path: reportPath, location }
  }
  if (segments.some((segment) => segment === 'fixtures' || segment === '__fixtures__')) {
    return { category: 'fixtures', path: reportPath, location }
  }
  if (
    segments.some(
      (segment) => segment === '.cache' || segment === '.vite' || segment === '.turbo'
    ) ||
    path.includes('/node_modules/.cache/')
  ) {
    return { category: 'development-caches', path: reportPath, location }
  }
  if (!options.allowSourceMaps && fileName.endsWith('.map')) {
    return { category: 'source-maps', path: reportPath, location }
  }
  if (
    fileName.endsWith('.tsbuildinfo') ||
    fileName === '.DS_Store' ||
    fileName === 'Thumbs.db' ||
    segments.some((segment) => segment === 'coverage' || segment === '.nyc_output')
  ) {
    return { category: 'build-leftovers', path: reportPath, location }
  }

  return null
}

function summarizeRuntimeDependencies(
  asarEntries: Set<string>,
  physicalFiles: PhysicalFile[],
  resourcesDir: string
): RuntimeDependencySummary[] {
  return RUNTIME_DEPENDENCIES.map((dependency) => {
    if (dependency.name === 'electron.safeStorage') {
      return {
        name: dependency.name,
        present: true,
        location: 'electron-runtime',
        path: null,
        purpose: dependency.purpose
      }
    }

    const packagePath = `node_modules/${dependency.name}/package.json`
    const located = locatePackagedPath(packagePath, asarEntries, physicalFiles, resourcesDir)
    return {
      name: dependency.name,
      present: located.location !== 'missing',
      location: located.location,
      path: located.path,
      purpose: dependency.purpose
    }
  })
}

function summarizeRequiredRuntimeAssets(
  asarEntries: Set<string>,
  physicalFiles: PhysicalFile[],
  resourcesDir: string
): RequiredRuntimeAssetSummary[] {
  return REQUIRED_RUNTIME_ASSETS.map((asset) => {
    const locatedCandidates = asset.candidates.map((candidate) =>
      locatePackagedPath(candidate, asarEntries, physicalFiles, resourcesDir)
    )
    const found = locatedCandidates.find((candidate) => candidate.location !== 'missing')
    return {
      id: asset.id,
      label: asset.label,
      present: Boolean(found),
      location: found?.location ?? 'missing',
      path: found?.path ?? null
    }
  })
}

function locatePackagedPath(
  requestedPath: string,
  asarEntries: Set<string>,
  physicalFiles: PhysicalFile[],
  resourcesDir: string
): LocatedPackagedPath {
  const normalized = normalizePath(requestedPath)
  if (normalized.startsWith('app.asar/')) {
    const asarPath = normalized.replace(/^app\.asar\//, '')
    return asarEntries.has(`/${asarPath}`)
      ? { location: 'asar', path: normalized }
      : { location: 'missing', path: null }
  }

  const asarPath = `/${normalized}`
  if (asarEntries.has(asarPath)) {
    return { location: 'asar', path: `app.asar/${normalized}` }
  }

  const physicalPath = physicalFiles.find((file) => file.relativePath === normalized)
  if (physicalPath) {
    return {
      location: normalized.includes('app.asar.unpacked') ? 'asar-unpacked' : 'file-system',
      path: physicalPath.relativePath
    }
  }

  const appOutDir = resolveAppOutDirFromResourcesDir(resourcesDir)
  const resourcesPath = normalizePath(relative(appOutDir, join(resourcesDir, normalized)))
  const physicalResourcePath = physicalFiles.find((file) => file.relativePath === resourcesPath)
  if (physicalResourcePath) {
    return {
      location: resourcesPath.includes('app.asar.unpacked') ? 'asar-unpacked' : 'file-system',
      path: physicalResourcePath.relativePath
    }
  }

  return { location: 'missing', path: null }
}

function resolveAppOutDirFromResourcesDir(resourcesDir: string): string {
  if (basename(resourcesDir) === 'Resources' && basename(dirname(resourcesDir)) === 'Contents') {
    return resolve(resourcesDir, '..', '..')
  }

  return dirname(resourcesDir)
}

function normalizeAsarEntry(entry: string): string {
  const normalized = normalizePath(entry)
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

function normalizePath(path: string): string {
  return path.split(sep).join('/')
}

function sumSizes(files: Array<{ sizeBytes: number }>): number {
  return files.reduce((total, file) => total + file.sizeBytes, 0)
}

function sortBySizeThenPath(a: InventoryPathSummary, b: InventoryPathSummary): number {
  return b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path)
}

function formatPathList(paths: InventoryPathSummary[]): string[] {
  return paths.length === 0
    ? ['- none']
    : paths.map((path) => `- ${formatBytes(path.sizeBytes)} ${path.path}`)
}

function formatPayloads(payloads: NativeOrExecutablePayload[]): string[] {
  return payloads.length === 0
    ? ['- none']
    : payloads.map(
        (payload) => `- ${formatBytes(payload.sizeBytes)} ${payload.reason} ${payload.path}`
      )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  for (const unit of units) {
    if (value < 1024) return `${value.toFixed(1)} ${unit}`
    value /= 1024
  }
  return `${value.toFixed(1)} TiB`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { inputPath, allowSourceMaps } = parseInventoryCliArgs(process.argv.slice(2))
  const appOutDir = resolvePackagedAppOutDir(inputPath)

  collectPackagedArtifactInventory(appOutDir, { allowSourceMaps })
    .then((inventory) => {
      process.stdout.write(formatPackagedArtifactInventory(inventory))
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err)
      process.exit(1)
    })
}
