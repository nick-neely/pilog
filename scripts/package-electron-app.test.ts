import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  normalizeConfigLineEndings,
  replaceTopLevelBlock,
  resolveDeployTarget,
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
})
