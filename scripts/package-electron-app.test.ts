import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  materializeNodeModuleLinks,
  normalizeConfigLineEndings,
  replaceTopLevelBlock,
  resolveDeployTarget,
  resolveExplicitRuntimePackageJsonFileSets,
  resolveStagingRoot
} from './package-electron-app.mjs'

describe('electron app packaging staging path', () => {
  it('keeps the default staging directory outside the repo but on the repo drive on Windows runners', () => {
    const repoRoot = 'D:\\a\\pilog\\pilog'
    const stagingRoot = resolveStagingRoot({ repoRoot, path: path.win32 })

    expect(stagingRoot).toBe('D:\\a\\pilog\\.pilog-electron-app')
    expect(resolveDeployTarget(repoRoot, stagingRoot, path.win32)).toBe('..\\.pilog-electron-app')
  })

  it('resolves explicit staging directories relative to the repo', () => {
    const repoRoot = '/home/runner/work/pilog/pilog'

    expect(
      resolveStagingRoot({
        envStagingDir: '.tmp/staged-app',
        repoRoot,
        path: path.posix
      })
    ).toBe('/home/runner/work/pilog/pilog/.tmp/staged-app')
  })

  it('rewrites electron-builder config blocks after Windows CRLF checkout conversion', () => {
    const config = normalizeConfigLineEndings(
      [
        'appId: dev.pilog.app',
        'productName: Pilog',
        'directories:',
        '  app: app',
        'files:',
        '  - out/**',
        ''
      ].join('\r\n')
    )

    expect(
      replaceTopLevelBlock(
        config,
        'directories',
        [
          'directories:',
          '  buildResources: D:\\a\\pilog\\pilog\\build',
          '  output: D:\\a\\pilog\\pilog\\dist'
        ].join('\n')
      )
    ).toContain(
      'directories:\n  buildResources: D:\\a\\pilog\\pilog\\build\n  output: D:\\a\\pilog\\pilog\\dist\nfiles:'
    )
  })

  it('materializes pnpm package links before electron-builder packages node_modules', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'pilog-package-electron-app-'))
    const nodeModulesDir = path.join(tmpDir, 'node_modules')
    const storePackageDir = path.join(
      nodeModulesDir,
      '.pnpm',
      '@earendil-works+pi-ai@0.74.0',
      'node_modules',
      '@earendil-works',
      'pi-ai'
    )
    const packageLinkDir = path.join(nodeModulesDir, '@earendil-works', 'pi-ai')
    const binLinkPath = path.join(nodeModulesDir, '.bin', 'pi-ai')

    try {
      await mkdir(storePackageDir, { recursive: true })
      await mkdir(path.dirname(packageLinkDir), { recursive: true })
      await mkdir(path.dirname(binLinkPath), { recursive: true })
      await writeFile(
        path.join(storePackageDir, 'package.json'),
        '{"name":"@earendil-works/pi-ai"}'
      )
      await writeFile(path.join(storePackageDir, 'cli.js'), 'console.log("ok")')
      await symlink(storePackageDir, packageLinkDir, 'dir')
      await symlink(path.join(storePackageDir, 'cli.js'), binLinkPath, 'file')

      const materializedCount = materializeNodeModuleLinks(nodeModulesDir)

      expect(materializedCount).toBe(1)
      expect(await readFile(path.join(packageLinkDir, 'package.json'), 'utf8')).toBe(
        '{"name":"@earendil-works/pi-ai"}'
      )
      expect((await lstat(binLinkPath)).isSymbolicLink()).toBe(true)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('adds explicit runtime package manifests to the electron-builder file set', async () => {
    const tmpDir = await mkdtemp(path.join(tmpdir(), 'pilog-package-electron-app-'))
    const stagingRoot = path.join(tmpDir, 'staged-app')

    try {
      await writePackageJson(stagingRoot, '@earendil-works/pi-agent-core', {
        name: '@earendil-works/pi-agent-core'
      })
      await writePackageJson(stagingRoot, '@earendil-works/pi-coding-agent', {
        name: '@earendil-works/pi-coding-agent'
      })
      await writePackageJson(stagingRoot, '@earendil-works/pi-ai', {
        name: '@earendil-works/pi-ai',
        dependencies: {
          openai: '6.26.0',
          '@google/genai': '^1.52.0'
        }
      })
      await writePackageJson(stagingRoot, 'openai', { name: 'openai' })
      await writePackageJson(stagingRoot, '@google/genai', { name: '@google/genai' })

      expect(resolveExplicitRuntimePackageJsonFileSets(stagingRoot)).toEqual(
        expect.arrayContaining([
          '  - from: node_modules/@earendil-works/pi-ai',
          '    to: node_modules/@earendil-works/pi-ai',
          '    filter:',
          '      - package.json',
          '  - from: node_modules/openai',
          '    to: node_modules/openai',
          '  - from: node_modules/@google/genai',
          '    to: node_modules/@google/genai'
        ])
      )
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })
})

async function writePackageJson(
  stagingRoot: string,
  packageName: string,
  contents: Record<string, unknown>
) {
  const packageJsonPath = path.join(
    stagingRoot,
    'node_modules',
    ...packageName.split('/'),
    'package.json'
  )
  await mkdir(path.dirname(packageJsonPath), { recursive: true })
  await writeFile(packageJsonPath, JSON.stringify(contents))
}
