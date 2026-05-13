import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar') as {
  createPackage(source: string, destination: string): Promise<void>
}
const {
  findPackagedFileHygieneViolations,
  enforcePackagedFileHygiene,
  prunePackagedRuntimeBloat
}: {
  findPackagedFileHygieneViolations: (
    appOutDir: string,
    options?: { allowSourceMaps?: boolean }
  ) => Array<{ category: string; location: string; path: string }>
  enforcePackagedFileHygiene: (appOutDir: string, options?: { allowSourceMaps?: boolean }) => void
  prunePackagedRuntimeBloat: (
    appOutDir: string,
    options?: { platform?: string; arch?: string }
  ) => { removedPaths: string[]; removedBytes: number }
} = require('./verify-packaged-runtime.cjs')

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'pilog-packaged-runtime-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('packaged runtime file hygiene', () => {
  it('rejects forbidden shipped files from asar and unpacked package output', async () => {
    const appOutDir = join(tmpDir, 'linux-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const asarSource = join(tmpDir, 'asar-source')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await writeFixtureFile(asarSource, 'out/main/index.test.js', 'test')
    await writeFixtureFile(asarSource, 'out/main/index.js.map', 'map')
    await writeFixtureFile(asarSource, 'fixtures/seed.json', '{}')
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackage(asarSource, join(resourcesDir, 'app.asar'))

    await writeFixtureFile(resourcesDir, 'app.asar.unpacked/node_modules/.cache/tool.json', '{}')
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/tool/build.tsbuildinfo',
      ''
    )

    const violations = findPackagedFileHygieneViolations(appOutDir)

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'tests',
          location: 'asar',
          path: 'app.asar/out/main/index.test.js'
        }),
        expect.objectContaining({
          category: 'source-maps',
          location: 'asar',
          path: 'app.asar/out/main/index.js.map'
        }),
        expect.objectContaining({
          category: 'fixtures',
          location: 'asar',
          path: 'app.asar/fixtures/seed.json'
        }),
        expect.objectContaining({
          category: 'development-caches',
          location: 'file-system',
          path: 'resources/app.asar.unpacked/node_modules/.cache/tool.json'
        }),
        expect.objectContaining({
          category: 'build-leftovers',
          location: 'file-system',
          path: 'resources/app.asar.unpacked/node_modules/tool/build.tsbuildinfo'
        })
      ])
    )
    expect(() => enforcePackagedFileHygiene(appOutDir)).toThrow(
      /Packaged file hygiene check failed/
    )
  })

  it('keeps required native and executable payloads allowed while honoring source-map policy', async () => {
    const appOutDir = join(tmpDir, 'linux-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const asarSource = join(tmpDir, 'asar-source')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await writeFixtureFile(asarSource, 'out/main/index.js.map', 'map')
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

    expect(() => enforcePackagedFileHygiene(appOutDir, { allowSourceMaps: true })).not.toThrow()
  })
})

describe('packaged runtime pruning', () => {
  it('removes native build inputs and non-target koffi binaries while keeping the target binary', async () => {
    const appOutDir = join(tmpDir, 'linux-unpacked')
    const resourcesDir = join(appOutDir, 'resources')

    await writeFixtureFile(resourcesDir, 'app.asar', 'asar placeholder')
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
      'sqlite native'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/better-sqlite3/deps/sqlite3/sqlite3.c',
      'sqlite amalgamation source'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/better-sqlite3/src/objects/database.hpp',
      'sqlite build header'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/koffi/build/koffi/linux_x64/koffi.node',
      'target koffi native'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/koffi/build/koffi/darwin_arm64/koffi.node',
      'non-target koffi native'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/koffi/doc/start.md',
      'koffi docs'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/koffi/vendor/node-api-headers/include/node_api.h',
      'koffi build header'
    )

    const result = prunePackagedRuntimeBloat(appOutDir, { platform: 'linux', arch: 'x64' })

    expect(result.removedBytes).toBeGreaterThan(0)
    expect(result.removedPaths).toEqual(
      expect.arrayContaining([
        'resources/app.asar.unpacked/node_modules/better-sqlite3/deps',
        'resources/app.asar.unpacked/node_modules/better-sqlite3/src',
        'resources/app.asar.unpacked/node_modules/koffi/build/koffi/darwin_arm64',
        'resources/app.asar.unpacked/node_modules/koffi/doc',
        'resources/app.asar.unpacked/node_modules/koffi/vendor'
      ])
    )
    await expect(
      writeFile(
        join(
          resourcesDir,
          'app.asar.unpacked',
          'node_modules',
          'koffi',
          'build',
          'koffi',
          'linux_x64',
          'runtime-check'
        ),
        'still present'
      )
    ).resolves.toBeUndefined()
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
