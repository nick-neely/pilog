import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectPackagedSizeBudgetReport,
  compareBudgets,
  formatPackagedSizeBudgetReport,
  parseBudgetCliArgs,
  type PackagedSizeBudgetPolicy
} from './packaged-size-budget'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar') as {
  createPackage(source: string, destination: string): Promise<void>
}

const tinyBudgetPolicy: PackagedSizeBudgetPolicy = {
  schemaVersion: 1,
  nonBlocking: true,
  supportedDownloadArtifacts: [
    {
      id: 'download-linux-appimage',
      label: 'Linux AppImage',
      platform: 'linux',
      kind: 'appimage',
      pattern: /\.AppImage$/i,
      budgetBytes: 10,
      rationale: 'fixture appimage budget'
    }
  ],
  unpackedApp: {
    id: 'unpacked-app',
    label: 'Unpacked packaged app',
    budgetBytes: 10,
    rationale: 'fixture unpacked app budget'
  },
  asarArchive: {
    id: 'asar-archive',
    label: 'app.asar archive',
    budgetBytes: 10_000,
    rationale: 'fixture asar budget'
  },
  asarUnpackedPayload: {
    id: 'asar-unpacked-payload',
    label: 'app.asar.unpacked payload',
    budgetBytes: 10,
    rationale: 'fixture unpacked payload budget'
  },
  nativeOrExecutablePayload: {
    id: 'native-or-executable-payload',
    label: 'Single native/executable payload',
    budgetBytes: 4,
    rationale: 'fixture native payload budget'
  },
  largeRuntimeDependency: {
    id: 'large-runtime-dependency',
    label: 'Large runtime dependency directory',
    budgetBytes: 5,
    rationale: 'fixture dependency budget'
  },
  protectedRuntimeCapabilities: [
    'SQLite database native adapter',
    'Pi agent/model/code-generation packages',
    'Repository search tooling'
  ]
}

describe('packaged size budget report', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pilog-packaged-size-budget-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('compares installer, unpacked app, asar, unpacked payload, and native budgets without failing', async () => {
    const distDir = join(tmpDir, 'dist')
    const appOutDir = join(distDir, 'linux-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const asarSource = join(tmpDir, 'asar-source')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-agent-core/package.json',
      '{}'
    )
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackage(asarSource, join(resourcesDir, 'app.asar'))

    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
      'native payload'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg',
      'repo search executable payload'
    )
    await writeFixtureFile(appOutDir, 'pilog', 'linux executable')
    await writeFixtureFile(distDir, 'Pilog-1.2.3.AppImage', 'download artifact payload')

    const report = await collectPackagedSizeBudgetReport({
      inputPath: appOutDir,
      distDir,
      budgets: tinyBudgetPolicy,
      largestCount: 20
    })

    expect(report.nonBlocking).toBe(true)
    expect(report.downloadArtifacts).toMatchObject([
      {
        id: 'download-linux-appimage',
        platform: 'linux',
        kind: 'appimage',
        path: 'Pilog-1.2.3.AppImage'
      }
    ])
    expect(report.comparisons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'download-artifact',
          status: 'over-budget',
          path: 'Pilog-1.2.3.AppImage'
        }),
        expect.objectContaining({
          category: 'unpacked-app',
          status: 'over-budget'
        }),
        expect.objectContaining({
          category: 'asar-archive',
          status: 'within-budget'
        }),
        expect.objectContaining({
          category: 'asar-unpacked-payload',
          status: 'over-budget'
        }),
        expect.objectContaining({
          category: 'native-or-executable-payload',
          status: 'over-budget',
          path: 'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
        }),
        expect.objectContaining({
          category: 'large-runtime-dependency',
          status: 'over-budget',
          path: 'resources/app.asar.unpacked/node_modules/@vscode/ripgrep'
        })
      ])
    )

    const reportText = formatPackagedSizeBudgetReport(report)
    expect(reportText).toContain('Mode: non-blocking report')
    expect(reportText).toContain('Protected runtime capabilities')
    expect(reportText).toContain('Largest directories:')
  })

  it('marks missing supported download artifacts as report findings', () => {
    const comparisons = compareBudgets({
      budgets: tinyBudgetPolicy,
      downloadArtifacts: [],
      inventory: {
        appOutDir: '/tmp/app',
        resourcesDir: '/tmp/app/resources',
        totalSizeBytes: 5,
        fileCount: 1,
        directoryCount: 1,
        largestFiles: [],
        largestDirectories: [],
        asar: {
          path: 'resources/app.asar',
          archiveSizeBytes: 5,
          entryCount: 1,
          unpackedPath: 'resources/app.asar.unpacked',
          unpackedSizeBytes: 0,
          unpackedFileCount: 0
        },
        nativeAndExecutablePayloads: [],
        forbiddenFindings: [],
        runtimeDependencies: [],
        requiredRuntimeAssets: []
      }
    })

    expect(comparisons).toContainEqual(
      expect.objectContaining({
        id: 'download-linux-appimage',
        category: 'download-artifact',
        status: 'missing',
        actualBytes: null
      })
    )
  })

  it('parses CLI options without treating flags as input paths', () => {
    expect(
      parseBudgetCliArgs([
        '--',
        'dist/linux-unpacked',
        '--dist-dir',
        'dist',
        '--output',
        'dist/budget.json',
        '--allow-source-maps',
        '--json'
      ])
    ).toEqual({
      inputPath: 'dist/linux-unpacked',
      distDir: 'dist',
      outputPath: 'dist/budget.json',
      allowSourceMaps: true,
      json: true,
      help: false
    })
  })
})

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const destination = join(root, ...relativePath.split('/'))
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, content)
}
