import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('WSL repository documentation', () => {
  it('documents Windows-installed Pilog with WSL-hosted repositories', async () => {
    const readme = await readFile('README.md', 'utf8')
    const piEmbeddingAdr = await readFile('docs/adr/0005-pi-embedding-strategy.md', 'utf8')

    expect(readme).toContain('Windows-installed Pilog can link GitHub repositories hosted in WSL')
    expect(readme).toContain('\\\\wsl.localhost\\<distro>\\...')
    expect(readme).toContain('\\\\wsl$\\<distro>\\...')
    expect(readme).toContain('Git must be installed inside the selected WSL distro')
    expect(readme).toContain('reads the live local WSL working tree')
    expect(readme).toContain('does not upload, sync, copy, or mutate the repository')

    for (const recoveryState of [
      'WSL unavailable',
      'distro unavailable',
      'Git missing in the distro',
      'missing path',
      'not a Git repo',
      'no origin',
      'unmatched GitHub repo'
    ]) {
      expect(readme).toContain(recoveryState)
    }

    expect(piEmbeddingAdr).toContain('repository access descriptor')
    expect(piEmbeddingAdr).toContain('Do not hand-roll UNC parsing')
  })
})
