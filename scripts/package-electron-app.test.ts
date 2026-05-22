import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { resolveDeployTarget, resolveStagingRoot } from './package-electron-app.mjs'

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
})
