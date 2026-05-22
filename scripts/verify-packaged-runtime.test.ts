import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const asar = require('@electron/asar') as {
  createPackage(source: string, destination: string): Promise<void>
  createPackageWithOptions(
    source: string,
    destination: string,
    options: { unpackDir?: string }
  ): Promise<void>
}
const {
  findPackagedFileHygieneViolations,
  enforcePackagedFileHygiene,
  verifyPackagedImports,
  verifyPackagedRuntimeFiles,
  prunePackagedRuntimeBloat
}: {
  findPackagedFileHygieneViolations: (
    appOutDir: string,
    options?: { allowSourceMaps?: boolean }
  ) => Array<{ category: string; location: string; path: string }>
  enforcePackagedFileHygiene: (appOutDir: string, options?: { allowSourceMaps?: boolean }) => void
  verifyPackagedImports: (
    appAsar: string,
    options?: { resourcesDir?: string; requiredImports?: string[] }
  ) => void
  verifyPackagedRuntimeFiles: (
    appOutDir: string,
    options?: { platform?: string; arch?: string }
  ) => void
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

  it('checks imports when package files are represented by unpacked asar entries', async () => {
    const appOutDir = join(tmpDir, 'win-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const appAsar = join(resourcesDir, 'app.asar')
    const asarSource = join(tmpDir, 'asar-source')

    await writeFixtureFile(
      asarSource,
      'node_modules/@scope/unpacked-package/package.json',
      '{"name":"@scope/unpacked-package","type":"module","main":"./dist/index.js"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@scope/unpacked-package/dist/index.js',
      'export const ok = true'
    )
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackageWithOptions(asarSource, appAsar, {
      unpackDir: 'node_modules/@scope/unpacked-package'
    })

    expect(() =>
      verifyPackagedImports(appAsar, {
        resourcesDir,
        requiredImports: ['@scope/unpacked-package']
      })
    ).not.toThrow()
  })

  it('checks imports through pnpm-style package links into unpacked asar entries', async () => {
    const appOutDir = join(tmpDir, 'win-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const appAsar = join(resourcesDir, 'app.asar')
    const asarSource = join(tmpDir, 'asar-source')
    const packageStorePath =
      'node_modules/.pnpm/@scope+linked-package@1.0.0/node_modules/@scope/linked-package'

    await writeFixtureFile(
      asarSource,
      `${packageStorePath}/package.json`,
      '{"name":"@scope/linked-package","type":"module","main":"./dist/index.js"}'
    )
    await writeFixtureFile(
      asarSource,
      `${packageStorePath}/dist/index.js`,
      'export const ok = true'
    )
    await mkdir(join(asarSource, 'node_modules/@scope'), { recursive: true })
    await symlink(
      '../../.pnpm/@scope+linked-package@1.0.0/node_modules/@scope/linked-package',
      join(asarSource, 'node_modules/@scope/linked-package'),
      'dir'
    )
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackageWithOptions(asarSource, appAsar, {
      unpackDir: 'node_modules/.pnpm'
    })

    expect(() =>
      verifyPackagedImports(appAsar, {
        resourcesDir,
        requiredImports: ['@scope/linked-package']
      })
    ).not.toThrow()
  })

  it('rejects missing dependencies declared by the packaged Pi AI package', async () => {
    const appOutDir = join(tmpDir, 'linux-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const asarSource = join(tmpDir, 'asar-source')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await writeFixtureFile(asarSource, 'package.json', '{"name":"pilog-app"}')
    await writeFixtureFile(
      asarSource,
      'node_modules/better-sqlite3/package.json',
      '{"name":"better-sqlite3"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/better-sqlite3/lib/index.js',
      'module.exports = {}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/drizzle-orm/better-sqlite3/index.js',
      'module.exports = {}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-agent-core/package.json',
      '{"name":"@earendil-works/pi-agent-core"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-ai/package.json',
      '{"name":"@earendil-works/pi-ai","dependencies":{"openai":"6.26.0"}}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-coding-agent/package.json',
      '{"name":"@earendil-works/pi-coding-agent"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@vscode/ripgrep/lib/index.js',
      'module.exports = {}'
    )
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

    expect(() => verifyPackagedRuntimeFiles(appOutDir, { platform: 'linux', arch: 'x64' })).toThrow(
      /node_modules\/openai\/package\.json/
    )
  })

  it('reads dependency metadata from required packages unpacked beside app.asar', async () => {
    const appOutDir = join(tmpDir, 'win-unpacked')
    const resourcesDir = join(appOutDir, 'resources')
    const asarSource = join(tmpDir, 'asar-source')

    await writeFixtureFile(asarSource, 'out/main/index.js', 'main')
    await writeFixtureFile(asarSource, 'package.json', '{"name":"pilog-app"}')
    await writeFixtureFile(
      asarSource,
      'node_modules/better-sqlite3/package.json',
      '{"name":"better-sqlite3"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/better-sqlite3/lib/index.js',
      'module.exports = {}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/drizzle-orm/better-sqlite3/index.js',
      'module.exports = {}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-agent-core/package.json',
      '{"name":"@earendil-works/pi-agent-core"}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-ai/package.json',
      '{"name":"@earendil-works/pi-ai","dependencies":{"openai":"6.26.0"}}'
    )
    await writeFixtureFile(
      asarSource,
      'node_modules/@earendil-works/pi-coding-agent/package.json',
      '{"name":"@earendil-works/pi-coding-agent"}'
    )
    await writeFixtureFile(asarSource, 'node_modules/openai/package.json', '{"name":"openai"}')
    await writeFixtureFile(
      asarSource,
      'node_modules/@vscode/ripgrep/lib/index.js',
      'module.exports = {}'
    )
    await mkdir(resourcesDir, { recursive: true })
    await asar.createPackageWithOptions(asarSource, join(resourcesDir, 'app.asar'), {
      unpackDir: 'node_modules/@earendil-works/pi-ai'
    })
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node',
      'native'
    )
    await writeFixtureFile(
      resourcesDir,
      'app.asar.unpacked/node_modules/@vscode/ripgrep-win32-x64/bin/rg.exe',
      'rg'
    )

    expect(() =>
      verifyPackagedRuntimeFiles(appOutDir, { platform: 'win32', arch: 'x64' })
    ).not.toThrow()
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
    expect(
      existsSync(
        join(
          resourcesDir,
          'app.asar.unpacked',
          'node_modules',
          'better-sqlite3',
          'build',
          'Release',
          'better_sqlite3.node'
        )
      )
    ).toBe(true)
    expect(
      existsSync(
        join(
          resourcesDir,
          'app.asar.unpacked',
          'node_modules',
          'koffi',
          'build',
          'koffi',
          'linux_x64',
          'koffi.node'
        )
      )
    ).toBe(true)
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
