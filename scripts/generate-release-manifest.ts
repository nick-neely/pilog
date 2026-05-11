/**
 * Generate and commit the Release Manifest from a GitHub Release's assets.
 *
 * Usage:
 *   tsx scripts/generate-release-manifest.ts --tag v1.2.3 --channel stable
 *   tsx scripts/generate-release-manifest.ts --tag v1.2.3-preview.4 --channel preview
 *
 * Reads the existing manifest at site/src/data/release-manifest.json, fetches
 * the GitHub Release asset list, builds the channel data, and writes the
 * updated manifest back. Git commit is handled by the calling workflow.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { ARTIFACT_EXTENSIONS } from './generate-checksums'
import {
  isValidReleaseManifest,
  validateReleaseManifest,
  type ReleaseArtifact,
  type ReleaseChannel,
  type ReleaseManifest,
  type PlatformRelease
} from '../site/src/lib/release-manifest'

// ── Types ──────────────────────────────────────────────────────────────────

export interface AssetInfo {
  name: string
  downloadUrl: string
  fileSize: number
}

type Platform = 'macos' | 'windows' | 'linux'

// ── Platform metadata ──────────────────────────────────────────────────────

const PLATFORM_ORDER: Platform[] = ['macos', 'windows', 'linux']

const PLATFORM_LABELS: Record<Platform, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux'
}

const PLATFORM_DESCRIPTIONS: Record<Platform, string> = {
  macos: 'Unsigned universal build for Apple Silicon and Intel Macs.',
  windows: 'Unsigned 64-bit installer for Windows 10+.',
  linux: 'AppImage and .deb packages.'
}

// ── Pure functions (exported for testing) ─────────────────────────────────

/**
 * Returns true if the asset name is a downloadable artifact (not a checksum
 * sidecar, updater metadata yml, or text summary file).
 */
export function isArtifactAsset(name: string): boolean {
  return ARTIFACT_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/**
 * Maps a filename to its target platform, or null if unrecognised.
 */
export function detectPlatform(name: string): Platform | null {
  if (name.endsWith('.dmg') || name.endsWith('-mac.zip')) return 'macos'
  if (name.endsWith('.exe')) return 'windows'
  if (name.endsWith('.AppImage') || name.endsWith('.deb') || name.endsWith('.snap')) return 'linux'
  return null
}

/**
 * Returns a human-readable label for a given artifact filename.
 */
export function detectLabel(name: string): string {
  if (name.endsWith('.dmg')) return 'DMG installer'
  if (name.endsWith('-mac.zip') || name.endsWith('.zip')) return 'ZIP archive'
  if (name.endsWith('.exe')) return 'Installer'
  if (name.endsWith('.AppImage')) return 'AppImage'
  if (name.endsWith('.deb')) return '.deb package'
  if (name.endsWith('.snap')) return '.snap package'
  return name
}

/**
 * Builds a ReleaseChannel from a flat list of GitHub Release assets and a
 * map of pre-downloaded SHA-256 checksums keyed by artifact filename.
 *
 * Non-artifact assets (checksums, yml metadata, txt summaries) are silently
 * ignored. Platforms with no matching artifacts are omitted from the result.
 */
export function buildChannel(params: {
  version: string
  releaseUrl: string
  publishedAt: string
  assets: AssetInfo[]
  checksums: Map<string, string>
}): ReleaseChannel {
  const { version, releaseUrl, publishedAt, assets, checksums } = params

  const byPlatform = new Map<Platform, ReleaseArtifact[]>()

  for (const asset of assets) {
    if (!isArtifactAsset(asset.name)) continue
    const platform = detectPlatform(asset.name)
    if (!platform) continue

    const sha256 = checksums.get(asset.name)
    const artifact: ReleaseArtifact = {
      fileName: asset.name,
      downloadUrl: asset.downloadUrl,
      label: detectLabel(asset.name),
      fileSize: asset.fileSize,
      ...(sha256 !== undefined ? { sha256 } : {})
    }

    const existing = byPlatform.get(platform) ?? []
    existing.push(artifact)
    byPlatform.set(platform, existing)
  }

  const platforms: PlatformRelease[] = PLATFORM_ORDER.filter((p) => byPlatform.has(p)).map(
    (p) => ({
      platform: p,
      label: PLATFORM_LABELS[p],
      description: PLATFORM_DESCRIPTIONS[p],
      artifacts: byPlatform.get(p)!
    })
  )

  return { version, releaseUrl, publishedAt, platforms }
}

/**
 * Returns a new manifest with the given channel updated. Does not mutate the
 * original.
 */
export function updateManifest(
  current: ReleaseManifest,
  channel: 'stable' | 'preview',
  channelData: ReleaseChannel
): ReleaseManifest {
  return { ...current, [channel]: channelData }
}

// ── I/O helpers (not unit-tested; exercised in CI) ─────────────────────────

function runGh(args: string[]): string {
  const result = spawnSync('gh', args, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`gh ${args.slice(0, 2).join(' ')} failed:\n${result.stderr}`)
  }
  return result.stdout
}

function fetchReleaseInfo(
  repo: string,
  tag: string
): { assets: AssetInfo[]; publishedAt: string; url: string } {
  const raw = runGh([
    'release',
    'view',
    tag,
    '--repo',
    repo,
    '--json',
    'assets,publishedAt,url'
  ])
  const data = JSON.parse(raw) as {
    assets: Array<{ name: string; size: number }>
    publishedAt: string
    url: string
  }

  const baseUrl = `https://github.com/${repo}/releases/download/${tag}`
  const assets: AssetInfo[] = data.assets.map((a) => ({
    name: a.name,
    downloadUrl: `${baseUrl}/${a.name}`,
    fileSize: a.size
  }))

  return { assets, publishedAt: data.publishedAt, url: data.url }
}

function fetchChecksums(repo: string, tag: string, dir: string): Map<string, string> {
  spawnSync(
    'gh',
    ['release', 'download', tag, '--repo', repo, '--pattern', '*.sha256', '--dir', dir, '--clobber'],
    { encoding: 'utf8' }
  )

  const checksums = new Map<string, string>()
  let files: string[] = []
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sha256'))
  } catch {
    return checksums
  }

  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf8').trim()
    const spaceIdx = content.indexOf('  ')
    if (spaceIdx === -1) continue
    const sha256 = content.slice(0, spaceIdx).trim()
    const fileName = content.slice(spaceIdx + 2).trim()
    if (sha256 && fileName) checksums.set(fileName, sha256)
  }
  return checksums
}

function parseArgs(argv: string[]): { tag: string; channel: 'stable' | 'preview' } {
  const args = argv.slice(2)
  let tag = ''
  let channel: 'stable' | 'preview' | '' = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) {
      tag = args[++i]
    } else if (args[i] === '--channel' && args[i + 1]) {
      const c = args[++i]
      if (c !== 'stable' && c !== 'preview') {
        throw new Error(`--channel must be "stable" or "preview", got: ${c}`)
      }
      channel = c
    }
  }

  if (!tag) throw new Error('--tag is required (e.g. --tag v1.2.3)')
  if (!channel) throw new Error('--channel is required (stable or preview)')
  return { tag, channel }
}

// ── CLI entry point ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { tag, channel } = parseArgs(process.argv)
  const repo = process.env.GITHUB_REPOSITORY ?? 'nick-neely/pilog'

  console.log(`Generating ${channel} manifest for ${tag} (repo: ${repo})`)

  const { assets, publishedAt, url } = fetchReleaseInfo(repo, tag)
  console.log(`Found ${assets.length} release assets`)

  const tmpDir = mkdtempSync(join(tmpdir(), 'pilog-manifest-'))
  let checksums = new Map<string, string>()
  try {
    checksums = fetchChecksums(repo, tag, tmpDir)
    console.log(`Loaded ${checksums.size} checksum(s)`)
  } catch (err) {
    console.warn('Could not load checksums:', err instanceof Error ? err.message : String(err))
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  const version = tag.replace(/^v/, '')
  const channelData = buildChannel({ version, releaseUrl: url, publishedAt, assets, checksums })
  console.log(
    `Built channel: ${channelData.platforms.length} platform(s): ${channelData.platforms.map((p) => p.platform).join(', ')}`
  )

  const manifestPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../site/src/data/release-manifest.json'
  )
  const existing = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown

  if (!isValidReleaseManifest(existing)) {
    const errs = validateReleaseManifest(existing)
    throw new Error(`Existing manifest is invalid:\n${errs.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`)
  }

  const updated = updateManifest(existing, channel, channelData)
  const errors = validateReleaseManifest(updated)
  if (errors.length > 0) {
    throw new Error(
      `Generated manifest failed validation:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join('\n')}`
    )
  }

  writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + '\n')
  console.log(`Manifest written to ${manifestPath}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}
