import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRepoIndexSnapshot } from './repo-indexer'

const SOURCE_CONTENT_SENTINEL = 'repoIndexSecretSentinel'
const SOURCE_VALUE_SENTINEL = 'do-not-store-source-content'
const LONG_CODE_SUMMARY =
  'This source file authenticates requests, validates session cookies, fetches private billing metadata, and coordinates several implementation details that should not be persisted as a long code summary.'

describe('createRepoIndexSnapshot', () => {
  const tempRepoPaths: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempRepoPaths.splice(0).map((repoPath) => rm(repoPath, { recursive: true, force: true }))
    )
  })

  it('stores lightweight repo signals without source contents or long code summaries', async () => {
    const repoPath = await createTempRepo('pilog-index-privacy-')

    await mkdir(path.join(repoPath, 'src'))
    await writeFile(
      path.join(repoPath, 'src', 'auth.ts'),
      `export const ${SOURCE_CONTENT_SENTINEL} = "${SOURCE_VALUE_SENTINEL}"\n// ${LONG_CODE_SUMMARY}`
    )
    await writeFile(
      path.join(repoPath, 'package.json'),
      JSON.stringify({ dependencies: { react: '^19.0.0', vite: '^7.0.0' } })
    )
    await writeFile(path.join(repoPath, 'pnpm-lock.yaml'), '')

    const snapshot = await createRepoIndexSnapshot(repoPath)
    const serializedSnapshot = JSON.stringify(snapshot)

    expect(snapshot).toMatchObject({
      packageManager: 'pnpm',
      frameworkSignals: ['React', 'Vite'],
      importantDirectories: [{ path: 'src', role: 'Source' }]
    })
    expect(serializedSnapshot).not.toContain(SOURCE_CONTENT_SENTINEL)
    expect(serializedSnapshot).not.toContain(SOURCE_VALUE_SENTINEL)
    expect(serializedSnapshot).not.toContain('authenticates requests')
    expect(serializedSnapshot).not.toContain(LONG_CODE_SUMMARY)
  })

  it('summarizes dependency, generated, ignored, and build-output paths as exclusions', async () => {
    const repoPath = await createTempRepo('pilog-index-exclusions-')
    await mkdir(path.join(repoPath, 'node_modules'))
    await mkdir(path.join(repoPath, 'dist'))
    await mkdir(path.join(repoPath, 'generated'))
    await mkdir(path.join(repoPath, '.git'))
    await writeFile(path.join(repoPath, '.gitignore'), 'dist\n')

    const snapshot = await createRepoIndexSnapshot(repoPath)
    const serializedSnapshot = JSON.stringify(snapshot)

    expect(snapshot.exclusionSummary).toEqual({
      dependency: 1,
      buildOutput: 1,
      generated: 1,
      binaryHeavy: 0,
      ignored: 2
    })
    expect(snapshot.importantDirectories).toEqual([])
    expect(serializedSnapshot).not.toContain('node_modules/')
    expect(serializedSnapshot).not.toContain('dist/')
    expect(serializedSnapshot).not.toContain('generated/')
  })

  async function createTempRepo(prefix: string): Promise<string> {
    const repoPath = await mkdtemp(path.join(os.tmpdir(), prefix))
    tempRepoPaths.push(repoPath)
    return repoPath
  }
})
