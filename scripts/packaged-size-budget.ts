import { existsSync } from 'node:fs'
import { readdir, stat, writeFile, mkdir } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectPackagedArtifactInventory,
  formatPackagedArtifactInventory,
  resolvePackagedAppOutDir,
  type InventoryPathSummary,
  type PackagedArtifactInventory
} from './packaged-artifact-inventory'

export const DEFAULT_SIZE_BUDGET_REPORT_PATH = 'dist/packaged-size-budget-report.json'

export interface ByteBudget {
  id: string
  label: string
  budgetBytes: number
  rationale: string
}

export interface DownloadArtifactBudget extends ByteBudget {
  platform: 'macos' | 'windows' | 'linux'
  kind: 'dmg' | 'mac-zip' | 'nsis-setup' | 'appimage' | 'deb'
  pattern: RegExp
}

export interface PackagedSizeBudgetPolicy {
  schemaVersion: 1
  nonBlocking: true
  supportedDownloadArtifacts: DownloadArtifactBudget[]
  unpackedApp: ByteBudget
  asarArchive: ByteBudget
  asarUnpackedPayload: ByteBudget
  nativeOrExecutablePayload: ByteBudget
  largeRuntimeDependency: ByteBudget
  protectedRuntimeCapabilities: string[]
}

export interface PackagedSizeBudgetOptions {
  inputPath?: string
  distDir?: string
  allowSourceMaps?: boolean
  largestCount?: number
  budgets?: PackagedSizeBudgetPolicy
}

export interface DownloadArtifactSummary {
  id: string
  label: string
  platform: DownloadArtifactBudget['platform']
  kind: DownloadArtifactBudget['kind']
  path: string
  sizeBytes: number
}

export interface BudgetComparison {
  id: string
  label: string
  category:
    | 'download-artifact'
    | 'unpacked-app'
    | 'asar-archive'
    | 'asar-unpacked-payload'
    | 'native-or-executable-payload'
    | 'large-runtime-dependency'
  status: 'within-budget' | 'over-budget' | 'missing'
  actualBytes: number | null
  budgetBytes: number
  deltaBytes: number | null
  path: string | null
  rationale: string
}

export interface PackagedSizeBudgetReport {
  schemaVersion: 1
  generatedAt: string
  nonBlocking: true
  budgets: PackagedSizeBudgetPolicy
  appOutDir: string
  distDir: string
  inventory: PackagedArtifactInventory
  downloadArtifacts: DownloadArtifactSummary[]
  comparisons: BudgetComparison[]
  attribution: {
    largestFiles: InventoryPathSummary[]
    largestDirectories: InventoryPathSummary[]
    nativeAndExecutablePayloads: PackagedArtifactInventory['nativeAndExecutablePayloads']
    runtimeDependencies: PackagedArtifactInventory['runtimeDependencies']
    forbiddenFindings: PackagedArtifactInventory['forbiddenFindings']
    protectedRuntimeAssets: PackagedArtifactInventory['requiredRuntimeAssets']
  }
}

const mib = (value: number): number => value * 1024 * 1024

export const INITIAL_PACKAGED_SIZE_BUDGETS: PackagedSizeBudgetPolicy = {
  schemaVersion: 1,
  nonBlocking: true,
  supportedDownloadArtifacts: [
    {
      id: 'download-macos-dmg',
      label: 'macOS DMG installer',
      platform: 'macos',
      kind: 'dmg',
      pattern: /\.dmg$/i,
      budgetBytes: mib(350),
      rationale:
        'Supported macOS direct download installer, rounded above the first inventory baseline.'
    },
    {
      id: 'download-macos-zip',
      label: 'macOS updater ZIP',
      platform: 'macos',
      kind: 'mac-zip',
      pattern: /-mac\.zip$/i,
      budgetBytes: mib(350),
      rationale: 'macOS auto-updater archive should track the same runtime payload as the DMG.'
    },
    {
      id: 'download-windows-setup',
      label: 'Windows NSIS setup',
      platform: 'windows',
      kind: 'nsis-setup',
      pattern: /Setup\.exe$/i,
      budgetBytes: mib(275),
      rationale: 'Supported Windows direct download installer, with room for signing metadata.'
    },
    {
      id: 'download-linux-appimage',
      label: 'Linux AppImage',
      platform: 'linux',
      kind: 'appimage',
      pattern: /\.AppImage$/i,
      budgetBytes: mib(275),
      rationale: 'Linux remains secondary for V1 but should continue reporting release size.'
    },
    {
      id: 'download-linux-deb',
      label: 'Linux deb package',
      platform: 'linux',
      kind: 'deb',
      pattern: /\.deb$/i,
      budgetBytes: mib(240),
      rationale:
        'Debian package should stay close to the AppImage payload after package compression.'
    }
  ],
  unpackedApp: {
    id: 'unpacked-app',
    label: 'Unpacked packaged app',
    budgetBytes: mib(800),
    rationale: 'Whole unpacked Electron Builder output, including Electron runtime and resources.'
  },
  asarArchive: {
    id: 'asar-archive',
    label: 'app.asar archive',
    budgetBytes: mib(120),
    rationale: 'Compiled app code, renderer assets, and runtime package metadata inside the asar.'
  },
  asarUnpackedPayload: {
    id: 'asar-unpacked-payload',
    label: 'app.asar.unpacked payload',
    budgetBytes: mib(280),
    rationale: 'Native bindings, repo-search executables, and assets that must remain unpacked.'
  },
  nativeOrExecutablePayload: {
    id: 'native-or-executable-payload',
    label: 'Single native/executable payload',
    budgetBytes: mib(90),
    rationale: 'Highlights oversized required native modules and repo-search binaries individually.'
  },
  largeRuntimeDependency: {
    id: 'large-runtime-dependency',
    label: 'Large runtime dependency directory',
    budgetBytes: mib(120),
    rationale: 'Surfaces dependency directories large enough to justify pruning follow-up work.'
  },
  protectedRuntimeCapabilities: [
    'SQLite database native adapter',
    'Pi agent/model/code-generation packages',
    'Repository search tooling',
    'App updater support',
    'OS secure-storage behavior',
    'App and tray identity assets'
  ]
}

export async function collectPackagedSizeBudgetReport(
  options: PackagedSizeBudgetOptions = {}
): Promise<PackagedSizeBudgetReport> {
  const budgets = options.budgets ?? INITIAL_PACKAGED_SIZE_BUDGETS
  const appOutDir = resolvePackagedAppOutDir(options.inputPath ?? 'dist')
  const resolvedDistDir = resolve(options.distDir ?? inferDistDir(options.inputPath ?? 'dist'))
  const inventory = await collectPackagedArtifactInventory(appOutDir, {
    allowSourceMaps: options.allowSourceMaps,
    largestCount: options.largestCount
  })
  const downloadArtifacts = await collectDownloadArtifacts(resolvedDistDir, budgets)
  const comparisons = compareBudgets({ budgets, inventory, downloadArtifacts })

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    nonBlocking: true,
    budgets,
    appOutDir,
    distDir: resolvedDistDir,
    inventory,
    downloadArtifacts,
    comparisons,
    attribution: {
      largestFiles: inventory.largestFiles,
      largestDirectories: inventory.largestDirectories,
      nativeAndExecutablePayloads: inventory.nativeAndExecutablePayloads,
      runtimeDependencies: inventory.runtimeDependencies,
      forbiddenFindings: inventory.forbiddenFindings,
      protectedRuntimeAssets: inventory.requiredRuntimeAssets
    }
  }
}

export function compareBudgets(input: {
  budgets: PackagedSizeBudgetPolicy
  inventory: PackagedArtifactInventory
  downloadArtifacts: DownloadArtifactSummary[]
}): BudgetComparison[] {
  const { budgets, inventory, downloadArtifacts } = input
  const comparisons: BudgetComparison[] = [
    compareKnownSize({
      category: 'unpacked-app',
      budget: budgets.unpackedApp,
      actualBytes: inventory.totalSizeBytes,
      path: inventory.appOutDir
    }),
    compareKnownSize({
      category: 'asar-archive',
      budget: budgets.asarArchive,
      actualBytes: inventory.asar.archiveSizeBytes,
      path: inventory.asar.path
    }),
    compareKnownSize({
      category: 'asar-unpacked-payload',
      budget: budgets.asarUnpackedPayload,
      actualBytes: inventory.asar.unpackedSizeBytes,
      path: inventory.asar.unpackedPath
    })
  ]

  for (const budget of budgets.supportedDownloadArtifacts) {
    const matches = downloadArtifacts.filter((artifact) => artifact.id === budget.id)
    if (matches.length === 0) {
      comparisons.push(compareMissing({ category: 'download-artifact', budget }))
      continue
    }
    for (const artifact of matches) {
      comparisons.push(
        compareKnownSize({
          category: 'download-artifact',
          budget,
          actualBytes: artifact.sizeBytes,
          path: artifact.path
        })
      )
    }
  }

  for (const payload of inventory.nativeAndExecutablePayloads) {
    comparisons.push(
      compareKnownSize({
        category: 'native-or-executable-payload',
        budget: budgets.nativeOrExecutablePayload,
        actualBytes: payload.sizeBytes,
        path: payload.path,
        label: `${budgets.nativeOrExecutablePayload.label}: ${payload.path}`
      })
    )
  }

  for (const dependency of findLargeRuntimeDependencyDirectories(inventory, budgets)) {
    comparisons.push(
      compareKnownSize({
        category: 'large-runtime-dependency',
        budget: budgets.largeRuntimeDependency,
        actualBytes: dependency.sizeBytes,
        path: dependency.path,
        label: `${budgets.largeRuntimeDependency.label}: ${dependency.path}`
      })
    )
  }

  return comparisons
}

export async function collectDownloadArtifacts(
  distDir: string,
  budgets: PackagedSizeBudgetPolicy = INITIAL_PACKAGED_SIZE_BUDGETS
): Promise<DownloadArtifactSummary[]> {
  if (!existsSync(distDir)) return []

  const files = await collectFiles(distDir)
  const artifacts: DownloadArtifactSummary[] = []
  for (const file of files) {
    const relativePath = normalizePath(relative(distDir, file.path))
    if (isPackagedAppRuntimePath(relativePath)) continue

    for (const budget of budgets.supportedDownloadArtifacts) {
      if (!budget.pattern.test(basename(file.path))) continue
      artifacts.push({
        id: budget.id,
        label: budget.label,
        platform: budget.platform,
        kind: budget.kind,
        path: relativePath,
        sizeBytes: file.sizeBytes
      })
    }
  }

  return artifacts.sort(
    (a, b) => a.platform.localeCompare(b.platform) || a.path.localeCompare(b.path)
  )
}

export function formatPackagedSizeBudgetReport(report: PackagedSizeBudgetReport): string {
  const lines = [
    'Packaged Size Budget Report',
    `App output: ${report.appOutDir}`,
    `Dist output: ${report.distDir}`,
    'Mode: non-blocking report',
    '',
    'Budget comparison',
    ...report.comparisons.map(formatComparison),
    '',
    'Protected runtime capabilities',
    ...report.budgets.protectedRuntimeCapabilities.map((capability) => `- ${capability}`),
    '',
    'Attribution',
    'Largest files:',
    ...formatPathList(report.attribution.largestFiles),
    'Largest directories:',
    ...formatPathList(report.attribution.largestDirectories),
    'Native and executable payloads:',
    ...formatPathList(report.attribution.nativeAndExecutablePayloads),
    '',
    formatPackagedArtifactInventory(report.inventory).trimEnd()
  ]

  return `${lines.join('\n')}\n`
}

export function parseBudgetCliArgs(args: string[]): {
  inputPath: string
  distDir: string
  outputPath: string
  allowSourceMaps: boolean
  json: boolean
  help: boolean
} {
  const parsed = {
    inputPath: 'dist',
    distDir: 'dist',
    outputPath: DEFAULT_SIZE_BUDGET_REPORT_PATH,
    allowSourceMaps: false,
    json: false,
    help: false
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--') {
      continue
    } else if (arg === '--dist-dir') {
      parsed.distDir = requireValue(args, (index += 1), arg)
    } else if (arg === '--output') {
      parsed.outputPath = requireValue(args, (index += 1), arg)
    } else if (arg === '--allow-source-maps') {
      parsed.allowSourceMaps = true
    } else if (arg === '--json') {
      parsed.json = true
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true
    } else if (!arg.startsWith('-')) {
      parsed.inputPath = arg
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return parsed
}

async function writeReport(report: PackagedSizeBudgetReport, outputPath: string): Promise<string> {
  const resolvedOutput = resolve(outputPath)
  await mkdir(dirname(resolvedOutput), { recursive: true })
  await writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`)
  return resolvedOutput
}

function compareKnownSize(input: {
  category: BudgetComparison['category']
  budget: ByteBudget
  actualBytes: number
  path: string
  label?: string
}): BudgetComparison {
  const deltaBytes = input.actualBytes - input.budget.budgetBytes
  return {
    id: input.budget.id,
    label: input.label ?? input.budget.label,
    category: input.category,
    status: deltaBytes > 0 ? 'over-budget' : 'within-budget',
    actualBytes: input.actualBytes,
    budgetBytes: input.budget.budgetBytes,
    deltaBytes,
    path: input.path,
    rationale: input.budget.rationale
  }
}

function compareMissing(input: {
  category: BudgetComparison['category']
  budget: ByteBudget
}): BudgetComparison {
  return {
    id: input.budget.id,
    label: input.budget.label,
    category: input.category,
    status: 'missing',
    actualBytes: null,
    budgetBytes: input.budget.budgetBytes,
    deltaBytes: null,
    path: null,
    rationale: input.budget.rationale
  }
}

function findLargeRuntimeDependencyDirectories(
  inventory: PackagedArtifactInventory,
  budgets: PackagedSizeBudgetPolicy
): InventoryPathSummary[] {
  return inventory.largestDirectories
    .filter((directory) => directory.sizeBytes >= budgets.largeRuntimeDependency.budgetBytes)
    .filter((directory) => /(^|\/)node_modules\//.test(directory.path))
}

async function collectFiles(rootDir: string): Promise<Array<{ path: string; sizeBytes: number }>> {
  const files: Array<{ path: string; sizeBytes: number }> = []

  async function visit(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        await visit(path)
        continue
      }
      if (!entry.isFile()) continue
      const info = await stat(path)
      files.push({ path, sizeBytes: info.size })
    }
  }

  await visit(rootDir)
  return files
}

function isPackagedAppRuntimePath(path: string): boolean {
  return (
    path.startsWith('linux-unpacked/') ||
    path.startsWith('win-unpacked/') ||
    path.startsWith('mac/') ||
    path.includes('/Pilog.app/')
  )
}

function inferDistDir(inputPath: string): string {
  const resolved = resolve(inputPath)
  if (basename(resolved).endsWith('.app')) return resolve(resolved, '..', '..')
  if (basename(resolved).endsWith('-unpacked')) return dirname(resolved)
  return inputPath
}

function formatComparison(comparison: BudgetComparison): string {
  const status =
    comparison.status === 'over-budget'
      ? `over by ${formatBytes(comparison.deltaBytes ?? 0)}`
      : comparison.status === 'missing'
        ? 'missing from this local dist output'
        : `under by ${formatBytes(Math.abs(comparison.deltaBytes ?? 0))}`
  const actual = comparison.actualBytes === null ? 'not found' : formatBytes(comparison.actualBytes)
  const path = comparison.path ? ` ${comparison.path}` : ''
  return `- ${comparison.label}: ${comparison.status} (${actual} / ${formatBytes(
    comparison.budgetBytes
  )}, ${status})${path}`
}

function formatPathList(paths: Array<{ path: string; sizeBytes: number }>): string[] {
  return paths.length === 0
    ? ['- none']
    : paths.map((path) => `- ${formatBytes(path.sizeBytes)} ${path.path}`)
}

function formatBytes(bytes: number): string {
  const absolute = Math.abs(bytes)
  const sign = bytes < 0 ? '-' : ''
  if (absolute < 1024) return `${sign}${absolute} B`
  const units = ['KiB', 'MiB', 'GiB']
  let value = absolute / 1024
  for (const unit of units) {
    if (value < 1024) return `${sign}${value.toFixed(1)} ${unit}`
    value /= 1024
  }
  return `${sign}${value.toFixed(1)} TiB`
}

function normalizePath(path: string): string {
  return path.split(sep).join('/')
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
  return value
}

function usage(): string {
  return [
    'Usage: tsx scripts/packaged-size-budget.ts [app-out-dir|dist] [options]',
    '',
    'Options:',
    '  --dist-dir <dir>        Dist directory containing installer artifacts. Defaults to dist.',
    `  --output <path>         JSON report path. Defaults to ${DEFAULT_SIZE_BUDGET_REPORT_PATH}.`,
    '  --allow-source-maps     Use the same source-map policy as inventory:packaged.',
    '  --json                  Print the full JSON report after writing it.',
    '  -h, --help              Show this help text.'
  ].join('\n')
}

async function main(): Promise<void> {
  const options = parseBudgetCliArgs(process.argv.slice(2))
  if (options.help) {
    console.log(usage())
    return
  }

  const report = await collectPackagedSizeBudgetReport(options)
  const outputPath = await writeReport(report, options.outputPath)
  process.stdout.write(formatPackagedSizeBudgetReport(report))
  console.log(`[packaged-size-budget] JSON report: ${outputPath}`)
  if (options.json) console.log(JSON.stringify(report, null, 2))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
}
