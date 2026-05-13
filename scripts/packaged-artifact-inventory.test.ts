import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectPackagedArtifactInventory,
  formatPackagedArtifactInventory,
  parseInventoryCliArgs,
  resolvePackagedAppOutDir
} from './packaged-artifact-inventory'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar') as {
  createPackage(source: string, destination: string): Promise<void>
}

describe('packaged artifact inventory', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pilog-packaged-inventory-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('summarizes packaged size, asar/unpacked contents, runtime dependencies, and forbidden files', async () => {
    const appOutDir = join(tmpDir, 'linux-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const asarSource = join(tmpDir, 'asar-source')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await writeFixtureFile(asarSource, 'out/main/index.js.map', 'map')
    await writeFixtureFile(asarSource, 'out/main/index.test.js', 'test')
    await writeFixtureFile(
      asarSource,
      'node_modules/better-sqlite3/package.json',
      '{"name":"better-sqlite3"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/drizzle-orm/package.json',
      '{"name":"drizzle-orm"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/electron-updater/package.json',
      '{"name":"electron-updater"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-agent-core/package.json',
      '{}'
    )
    await writeFixtureFile(asarSource, 'node_modules/@earendil-works/pi-ai/package.json', '{}')
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-coding-agent/package.json',
      '{}'
    )
    await writeFixtureFile(asarSource, 'node_modules/@vscode/ripgrep/package.json', '{}')
    await writeFixtureFile(asarSource, 'node_modules/simple-git/package.json', '{}')
    await writeFixtureFile(asarSource, 'resources/icon.png', 'icon')
    await writeFixtureFile(asarSource, 'resources/tray-icon.png', 'tray')
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackage(asarSource, join(resourcesDir, 'app.asar'))

    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
      'native'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg',
      'rg'
    )
    await chmod(join(resourcesDir, 'app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg'), 0o755)
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/.cache/dev-cache.json',
      '{}'
    )
    await writeFixtureFile(resourcesDir, 'leftover.tsbuildinfo', 'cache')
    await writeFixtureFile(appOutDir, 'pilog', 'binary')
    await chmod(join(appOutDir, 'pilog'), 0o755)

    const inventory = await collectPackagedArtifactInventory(appOutDir, {
      largestCount: 5,
      allowSourceMaps: false
    })

    expect(inventory.totalSizeBytes).toBeGreaterThan(0)
    expect(inventory.asar.archiveSizeBytes).toBeGreaterThan(0)
    expect(inventory.asar.entryCount).toBeGreaterThan(10)
    expect(inventory.asar.unpackedSizeBytes).toBeGreaterThan(0)
    expect(inventory.largestFiles.map((file) => file.path)).toContain('resources/app.asar')
    expect(inventory.largestDirectories[0].sizeBytes).toBeGreaterThan(0)

    expect(inventory.nativeAndExecutablePayloads.map((payload) => payload.path)).toEqual(
      expect.arrayContaining([
        'pilog',
        'resources/app.asar.unpacked/node_modules/@vscode/ripgrep/bin/rg',
        'resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
      ])
    )

    expect(inventory.forbiddenFindings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining(['tests', 'development-caches', 'source-maps', 'build-leftovers'])
    )
    expect(
      inventory.requiredRuntimeAssets.find((asset) => asset.id === 'sqlite-native')?.present
    ).toBe(true)
    expect(inventory.requiredRuntimeAssets.find((asset) => asset.id === 'app-icon')?.present).toBe(
      true
    )
    expect(inventory.requiredRuntimeAssets.find((asset) => asset.id === 'tray-icon')?.present).toBe(
      true
    )
    expect(
      inventory.runtimeDependencies.find((dep) => dep.name === '@vscode/ripgrep')?.location
    ).toBe('asar')
    expect(
      inventory.runtimeDependencies.find((dep) => dep.name === 'electron.safeStorage')?.location
    ).toBe('electron-runtime')
  })

  it('honors the explicit source map policy', async () => {
    const appOutDir = join(tmpDir, 'linux-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const asarSource = join(tmpDir, 'asar-with-map')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await writeFixtureFile(asarSource, 'out/main/index.js.map', 'map')
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackage(asarSource, join(resourcesDir, 'app.asar'))

    const blocked = await collectPackagedArtifactInventory(appOutDir, { allowSourceMaps: false })
    const allowed = await collectPackagedArtifactInventory(appOutDir, { allowSourceMaps: true })

    expect(blocked.forbiddenFindings.some((finding) => finding.category === 'source-maps')).toBe(
      true
    )
    expect(allowed.forbiddenFindings.some((finding) => finding.category === 'source-maps')).toBe(
      false
    )
  })

  it('formats a maintainer-readable baseline report', async () => {
    const appOutDir = join(tmpDir, 'linux-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const asarSource = join(tmpDir, 'asar-report')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackage(asarSource, join(resourcesDir, 'app.asar'))

    const inventory = await collectPackagedArtifactInventory(appOutDir)
    const report = formatPackagedArtifactInventory(inventory)

    expect(report).toContain('Packaged Artifact Inventory')
    expect(report).toContain('Total unpacked size:')
    expect(report).toContain('Asar breakdown')
    expect(report).toContain('Runtime dependencies')
    expect(report).toContain('Required runtime assets')
  })

  it('locates unpacked runtime assets under macOS Contents/Resources', async () => {
    const appOutDir = join(tmpDir, 'mac', 'Pilog.app')
    const resourcesDir = join(appOutDir, 'Contents', 'Resources')
    const asarSource = join(tmpDir, 'asar-macos')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackage(asarSource, join(resourcesDir, 'app.asar'))
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
      'native'
    )

    const inventory = await collectPackagedArtifactInventory(appOutDir)

    expect(
      inventory.requiredRuntimeAssets.find((asset) => asset.id === 'sqlite-native')
    ).toMatchObject({
      present: true,
      location: 'asar-unpacked',
      path: 'Contents/Resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
    })
  })

  it('resolves the current platform unpacked build under dist by default', () => {
    const distDir = join(tmpDir, 'dist')
    let expected = join(distDir, 'linux-unpacked')
    if (process.platform === 'win32') {
      expected = join(distDir, 'win-unpacked')
    }
    if (process.platform === 'darwin') {
      expected = join(distDir, 'mac', 'Pilog.app')
    }

    expect(resolvePackagedAppOutDir(distDir)).toBe(expected)
  })

  it('parses source-map policy without treating the flag as the input path', () => {
    expect(parseInventoryCliArgs(['--allow-source-maps'])).toEqual({
      inputPath: 'dist',
      allowSourceMaps: true
    })
    expect(parseInventoryCliArgs(['dist/linux-unpacked', '--allow-source-maps'])).toEqual({
      inputPath: 'dist/linux-unpacked',
      allowSourceMaps: true
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
