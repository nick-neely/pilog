import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadDotEnvFile } from './env'

describe('loadDotEnvFile', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('loads variables from a dotenv file without overriding existing environment values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pilog-env-test-'))
    tempDirs.push(dir)

    const envFile = join(dir, '.env')
    writeFileSync(
      envFile,
      [
        '# GitHub OAuth',
        'GITHUB_CLIENT_ID=client_from_file',
        'GITHUB_CLIENT_SECRET="secret from file"',
        'EXISTING=value_from_file'
      ].join('\n')
    )

    const env: NodeJS.ProcessEnv = { EXISTING: 'value_from_shell' }
    loadDotEnvFile(envFile, env)

    expect(env.GITHUB_CLIENT_ID).toBe('client_from_file')
    expect(env.GITHUB_CLIENT_SECRET).toBe('secret from file')
    expect(env.EXISTING).toBe('value_from_shell')
  })
})
