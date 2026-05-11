/**
 * Generate SHA-256 checksums for Pilog release artifacts.
 *
 * Stable artifact names  (electron-builder.yml):
 *   macOS:   Pilog-<version>.dmg  |  Pilog-<version>-mac.zip
 *   Windows: Pilog-<version>-Setup.exe
 *   Linux:   Pilog-<version>.AppImage  |  Pilog-<version>.deb
 *
 * Preview artifact names (electron-builder.preview.yml):
 *   macOS:   Pilog-<version>-preview.dmg  |  Pilog-<version>-preview-mac.zip
 *   Windows: Pilog-<version>-preview-Setup.exe
 *   Linux:   Pilog-<version>-preview.AppImage  |  Pilog-<version>-preview.deb
 *
 * Output per artifact: <artifact>.sha256
 * Output combined:     <distDir>/checksums.txt  (sha256sum-compatible format)
 */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readdir, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ARTIFACT_EXTENSIONS = ['.dmg', '.exe', '.AppImage', '.deb', '.snap', '.zip']

export interface ChecksumEntry {
  sha256: string
  fileName: string
}

export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

export async function findArtifacts(distDir: string): Promise<string[]> {
  const entries = await readdir(distDir)
  const artifacts: string[] = []
  for (const entry of entries) {
    if (ARTIFACT_EXTENSIONS.some((ext) => entry.endsWith(ext))) {
      const fullPath = join(distDir, entry)
      const info = await stat(fullPath)
      if (info.isFile()) {
        artifacts.push(fullPath)
      }
    }
  }
  return artifacts.sort()
}

export function formatChecksumsFile(entries: ChecksumEntry[]): string {
  return entries.map(({ sha256, fileName }) => `${sha256}  ${fileName}`).join('\n') + '\n'
}

export async function generateChecksums(distDir: string): Promise<ChecksumEntry[]> {
  if (!existsSync(distDir)) {
    throw new Error(`Distribution directory not found: ${distDir}`)
  }

  const artifacts = await findArtifacts(distDir)
  if (artifacts.length === 0) {
    throw new Error(`No artifacts found in ${distDir}`)
  }

  const entries: ChecksumEntry[] = []
  for (const artifact of artifacts) {
    const sha256 = await hashFile(artifact)
    const fileName = basename(artifact)
    entries.push({ sha256, fileName })
    await writeFile(`${artifact}.sha256`, `${sha256}  ${fileName}\n`)
    console.log(`${fileName}: ${sha256}`)
  }

  const checksumsPath = join(distDir, 'checksums.txt')
  await writeFile(checksumsPath, formatChecksumsFile(entries))
  console.log(`\nChecksums written to ${checksumsPath}`)

  return entries
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const distDir = process.argv[2] ?? 'dist'
  generateChecksums(distDir).catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
