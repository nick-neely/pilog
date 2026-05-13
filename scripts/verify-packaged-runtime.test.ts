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
  enforcePackagedFileHygiene
}: {
  findPackagedFileHygieneViolations: (
    appOutDir: string,
    options?: { allowSourceMaps?: boolean }
  ) => Array<{ category: string; location: string; path: string }>
  enforcePackagedFileHygiene: (appOutDir: string, options?: { allowSourceMaps?: boolean }) => void
} = require('./verify-packaged-runtime.cjs')

describe('packaged runtime file hygiene', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pilog-packaged-hygiene-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

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

async function writeFixtureFile(
  root: string,
  relativePath: string,
  content: string
): Promise<void> {
  const destination = join(root, ...relativePath.split('/'))
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, content)
}
