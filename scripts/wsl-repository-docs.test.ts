import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const README_WSL_DETAILS = [
  'Windows-installed Pilog can link GitHub repositories hosted in WSL',
  '\\\\wsl.localhost\\<distro>\\...',
  '\\\\wsl$\\<distro>\\...',
  'Git must be installed inside the selected WSL distro',
  'reads the live local WSL working tree',
  'does not upload, sync, copy, or mutate the repository'
] as const

const README_RECOVERY_STATES = [
  'WSL unavailable',
  'distro unavailable',
  'Git missing in the distro',
  'missing path',
  'not a Git repo',
  'no origin',
  'unmatched GitHub repo'
] as const

const ADR_WSL_DETAILS = ['repository access descriptor', 'Do not hand-roll UNC parsing'] as const

describe('WSL repository documentation', () => {
  it('documents Windows-installed Pilog with WSL-hosted repositories', async () => {
    const [readme, piEmbeddingAdr] = await Promise.all([
      readFile('README.md', 'utf8'),
      readFile('docs/adr/0005-pi-embedding-strategy.md', 'utf8')
    ])

    for (const requiredText of README_WSL_DETAILS) {
      expect(readme).toContain(requiredText)
    }

    for (const recoveryState of README_RECOVERY_STATES) {
      expect(readme).toContain(recoveryState)
    }

    for (const requiredText of ADR_WSL_DETAILS) {
      expect(piEmbeddingAdr).toContain(requiredText)
    }
  })
})
