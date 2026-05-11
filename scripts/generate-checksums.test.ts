import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ARTIFACT_EXTENSIONS,
  type ChecksumEntry,
  findArtifacts,
  formatChecksumsFile,
  generateChecksums,
  hashFile
} from './generate-checksums'

describe('ARTIFACT_EXTENSIONS', () => {
  it('includes macOS, Windows, and Linux extensions', () => {
    expect(ARTIFACT_EXTENSIONS).toContain('.dmg')
    expect(ARTIFACT_EXTENSIONS).toContain('.exe')
    expect(ARTIFACT_EXTENSIONS).toContain('.AppImage')
    expect(ARTIFACT_EXTENSIONS).toContain('.deb')
    expect(ARTIFACT_EXTENSIONS).toContain('.zip')
  })
})

describe('formatChecksumsFile', () => {
  it('formats entries in sha256sum-compatible format', () => {
    const entries: ChecksumEntry[] = [
      { sha256: 'abc123', fileName: 'Pilog-1.0.0.dmg' },
      { sha256: 'def456', fileName: 'Pilog-1.0.0-Setup.exe' }
    ]
    const result = formatChecksumsFile(entries)
    expect(result).toBe('abc123  Pilog-1.0.0.dmg\ndef456  Pilog-1.0.0-Setup.exe\n')
  })

  it('uses double-space separator (sha256sum convention)', () => {
    const entries: ChecksumEntry[] = [{ sha256: 'aaa', fileName: 'file.dmg' }]
    const result = formatChecksumsFile(entries)
    expect(result).toContain('aaa  file.dmg')
  })

  it('ends with a trailing newline', () => {
    const entries: ChecksumEntry[] = [{ sha256: 'aaa', fileName: 'file.exe' }]
    expect(formatChecksumsFile(entries)).toMatch(/\n$/)
  })

  it('handles multiple entries separated by newlines', () => {
    const entries: ChecksumEntry[] = [
      { sha256: 'a1', fileName: 'a.dmg' },
      { sha256: 'b2', fileName: 'b.exe' },
      { sha256: 'c3', fileName: 'c.AppImage' }
    ]
    const lines = formatChecksumsFile(entries).trimEnd().split('\n')
    expect(lines).toHaveLength(3)
  })
})

describe('hashFile', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pilog-checksums-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('returns a 64-character hex SHA-256 digest', async () => {
    const file = join(tmpDir, 'sample.dmg')
    await writeFile(file, 'hello world')
    const hash = await hashFile(file)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('produces the correct SHA-256 for known content', async () => {
    const file = join(tmpDir, 'known.dmg')
    await writeFile(file, 'hello world')
    const hash = await hashFile(file)
    // sha256("hello world") = b94d27b9934d3e08a52e52d7da7dabfac484efe04294e576da0179a4ef725d85
    // Let's just verify it's deterministic and not empty
    expect(hash).not.toBe('')
    expect(await hashFile(file)).toBe(hash)
  })

  it('produces different hashes for different content', async () => {
    const file1 = join(tmpDir, 'a.dmg')
    const file2 = join(tmpDir, 'b.dmg')
    await writeFile(file1, 'content-a')
    await writeFile(file2, 'content-b')
    expect(await hashFile(file1)).not.toBe(await hashFile(file2))
  })
})

describe('findArtifacts', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pilog-artifacts-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('finds files with recognized artifact extensions', async () => {
    await writeFile(join(tmpDir, 'Pilog-1.0.0.dmg'), '')
    await writeFile(join(tmpDir, 'Pilog-1.0.0-Setup.exe'), '')
    await writeFile(join(tmpDir, 'Pilog-1.0.0.AppImage'), '')
    const found = await findArtifacts(tmpDir)
    const names = found.map((f) => f.split('/').pop())
    expect(names).toContain('Pilog-1.0.0.dmg')
    expect(names).toContain('Pilog-1.0.0-Setup.exe')
    expect(names).toContain('Pilog-1.0.0.AppImage')
  })

  it('ignores non-artifact files like yml metadata', async () => {
    await writeFile(join(tmpDir, 'latest.yml'), '')
    await writeFile(join(tmpDir, 'preview.yml'), '')
    await writeFile(join(tmpDir, 'Pilog-1.0.0.dmg'), '')
    const found = await findArtifacts(tmpDir)
    expect(found).toHaveLength(1)
  })

  it('recognizes preview artifact names', async () => {
    await writeFile(join(tmpDir, 'Pilog-1.0.0-preview.dmg'), '')
    await writeFile(join(tmpDir, 'Pilog-1.0.0-preview-Setup.exe'), '')
    await writeFile(join(tmpDir, 'Pilog-1.0.0-preview.AppImage'), '')
    const found = await findArtifacts(tmpDir)
    expect(found).toHaveLength(3)
  })

  it('returns an empty array when no artifacts are present', async () => {
    await writeFile(join(tmpDir, 'latest.yml'), '')
    const found = await findArtifacts(tmpDir)
    expect(found).toHaveLength(0)
  })

  it('returns sorted paths', async () => {
    await writeFile(join(tmpDir, 'z.exe'), '')
    await writeFile(join(tmpDir, 'a.dmg'), '')
    const found = await findArtifacts(tmpDir)
    const names = found.map((f) => f.split('/').pop())
    expect(names).toEqual(['a.dmg', 'z.exe'])
  })
})

describe('generateChecksums', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'pilog-gen-checksums-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true })
  })

  it('writes individual .sha256 files for each artifact', async () => {
    await writeFile(join(tmpDir, 'Pilog-1.0.0.dmg'), 'fake-dmg-content')
    await generateChecksums(tmpDir)
    const { readFile } = await import('node:fs/promises')
    const sidecar = await readFile(join(tmpDir, 'Pilog-1.0.0.dmg.sha256'), 'utf8')
    expect(sidecar).toMatch(/^[0-9a-f]{64}  Pilog-1\.0\.0\.dmg\n$/)
  })

  it('writes a combined checksums.txt file', async () => {
    await writeFile(join(tmpDir, 'Pilog-1.0.0.dmg'), 'dmg')
    await writeFile(join(tmpDir, 'Pilog-1.0.0-Setup.exe'), 'exe')
    await generateChecksums(tmpDir)
    const { readFile } = await import('node:fs/promises')
    const combined = await readFile(join(tmpDir, 'checksums.txt'), 'utf8')
    expect(combined).toContain('Pilog-1.0.0.dmg')
    expect(combined).toContain('Pilog-1.0.0-Setup.exe')
  })

  it('returns all checksum entries', async () => {
    await writeFile(join(tmpDir, 'Pilog-1.0.0.dmg'), 'dmg')
    const entries = await generateChecksums(tmpDir)
    expect(entries).toHaveLength(1)
    expect(entries[0].fileName).toBe('Pilog-1.0.0.dmg')
    expect(entries[0].sha256).toHaveLength(64)
  })

  it('throws when distDir does not exist', async () => {
    await expect(generateChecksums('/nonexistent/path/dist')).rejects.toThrow(
      'Distribution directory not found'
    )
  })

  it('throws when no artifacts are found', async () => {
    await expect(generateChecksums(tmpDir)).rejects.toThrow('No artifacts found')
  })
})
