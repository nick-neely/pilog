import { describe, expect, it } from 'vitest'
import {
  buildChannel,
  detectLabel,
  detectPlatform,
  isArtifactAsset,
  updateManifest,
  type AssetInfo
} from './generate-release-manifest'
import { validateReleaseManifest, type ReleaseManifest } from '../site/src/lib/release-manifest'

describe('isArtifactAsset', () => {
  it('returns true for downloadable artifact files', () => {
    expect(isArtifactAsset('Pilog-1.0.0.dmg')).toBe(true)
    expect(isArtifactAsset('Pilog-1.0.0-mac.zip')).toBe(true)
    expect(isArtifactAsset('Pilog-1.0.0-Setup.exe')).toBe(true)
    expect(isArtifactAsset('Pilog-1.0.0.AppImage')).toBe(true)
    expect(isArtifactAsset('Pilog-1.0.0.deb')).toBe(true)
    expect(isArtifactAsset('Pilog-1.0.0.snap')).toBe(true)
  })

  it('returns true for preview artifact files', () => {
    expect(isArtifactAsset('Pilog-0.1.0-preview.dmg')).toBe(true)
    expect(isArtifactAsset('Pilog-0.1.0-preview-mac.zip')).toBe(true)
    expect(isArtifactAsset('Pilog-0.1.0-preview-Setup.exe')).toBe(true)
    expect(isArtifactAsset('Pilog-0.1.0-preview.AppImage')).toBe(true)
    expect(isArtifactAsset('Pilog-0.1.0-preview.deb')).toBe(true)
  })

  it('returns false for checksum sidecars, updater metadata, and text files', () => {
    expect(isArtifactAsset('Pilog-1.0.0.dmg.sha256')).toBe(false)
    expect(isArtifactAsset('latest-mac.yml')).toBe(false)
    expect(isArtifactAsset('latest.yml')).toBe(false)
    expect(isArtifactAsset('preview.yml')).toBe(false)
    expect(isArtifactAsset('checksums-mac.txt')).toBe(false)
    expect(isArtifactAsset('checksums-win.txt')).toBe(false)
    expect(isArtifactAsset('Pilog-1.0.0.dmg.blockmap')).toBe(false)
    expect(isArtifactAsset('builder-debug.yml')).toBe(false)
  })
})

describe('detectPlatform', () => {
  it('identifies macOS artifacts', () => {
    expect(detectPlatform('Pilog-1.0.0.dmg')).toBe('macos')
    expect(detectPlatform('Pilog-1.0.0-mac.zip')).toBe('macos')
    expect(detectPlatform('Pilog-0.1.0-preview.dmg')).toBe('macos')
    expect(detectPlatform('Pilog-0.1.0-preview-mac.zip')).toBe('macos')
  })

  it('identifies Windows artifacts', () => {
    expect(detectPlatform('Pilog-1.0.0-Setup.exe')).toBe('windows')
    expect(detectPlatform('Pilog-0.1.0-preview-Setup.exe')).toBe('windows')
  })

  it('identifies Linux artifacts', () => {
    expect(detectPlatform('Pilog-1.0.0.AppImage')).toBe('linux')
    expect(detectPlatform('Pilog-1.0.0.deb')).toBe('linux')
    expect(detectPlatform('Pilog-1.0.0.snap')).toBe('linux')
    expect(detectPlatform('Pilog-0.1.0-preview.AppImage')).toBe('linux')
    expect(detectPlatform('Pilog-0.1.0-preview.deb')).toBe('linux')
  })

  it('returns null for non-artifact files', () => {
    expect(detectPlatform('latest.yml')).toBeNull()
    expect(detectPlatform('latest-mac.yml')).toBeNull()
    expect(detectPlatform('Pilog-1.0.0.dmg.sha256')).toBeNull()
    expect(detectPlatform('checksums-mac.txt')).toBeNull()
  })
})

describe('detectLabel', () => {
  it('returns correct labels for each artifact type', () => {
    expect(detectLabel('Pilog-1.0.0.dmg')).toBe('DMG installer')
    expect(detectLabel('Pilog-0.1.0-preview.dmg')).toBe('DMG installer')
    expect(detectLabel('Pilog-1.0.0-mac.zip')).toBe('ZIP archive')
    expect(detectLabel('Pilog-0.1.0-preview-mac.zip')).toBe('ZIP archive')
    expect(detectLabel('Pilog-1.0.0-Setup.exe')).toBe('Installer')
    expect(detectLabel('Pilog-0.1.0-preview-Setup.exe')).toBe('Installer')
    expect(detectLabel('Pilog-1.0.0.AppImage')).toBe('AppImage')
    expect(detectLabel('Pilog-1.0.0.deb')).toBe('.deb package')
    expect(detectLabel('Pilog-1.0.0.snap')).toBe('.snap package')
  })
})

describe('buildChannel', () => {
  const stableAssets: AssetInfo[] = [
    {
      name: 'Pilog-1.0.0.dmg',
      downloadUrl: 'https://github.com/nick-neely/pilog/releases/download/v1.0.0/Pilog-1.0.0.dmg',
      fileSize: 100000
    },
    {
      name: 'Pilog-1.0.0-mac.zip',
      downloadUrl:
        'https://github.com/nick-neely/pilog/releases/download/v1.0.0/Pilog-1.0.0-mac.zip',
      fileSize: 80000
    },
    {
      name: 'Pilog-1.0.0-Setup.exe',
      downloadUrl:
        'https://github.com/nick-neely/pilog/releases/download/v1.0.0/Pilog-1.0.0-Setup.exe',
      fileSize: 90000
    },
    {
      name: 'Pilog-1.0.0.AppImage',
      downloadUrl:
        'https://github.com/nick-neely/pilog/releases/download/v1.0.0/Pilog-1.0.0.AppImage',
      fileSize: 95000
    },
    {
      name: 'Pilog-1.0.0.deb',
      downloadUrl: 'https://github.com/nick-neely/pilog/releases/download/v1.0.0/Pilog-1.0.0.deb',
      fileSize: 70000
    },
    // Non-artifacts that should be filtered out
    {
      name: 'Pilog-1.0.0.dmg.sha256',
      downloadUrl:
        'https://github.com/nick-neely/pilog/releases/download/v1.0.0/Pilog-1.0.0.dmg.sha256',
      fileSize: 70
    },
    {
      name: 'latest-mac.yml',
      downloadUrl:
        'https://github.com/nick-neely/pilog/releases/download/v1.0.0/latest-mac.yml',
      fileSize: 500
    },
    {
      name: 'checksums-mac.txt',
      downloadUrl:
        'https://github.com/nick-neely/pilog/releases/download/v1.0.0/checksums-mac.txt',
      fileSize: 200
    }
  ]

  const checksums = new Map([
    ['Pilog-1.0.0.dmg', 'abc123deadbeef'],
    ['Pilog-1.0.0-mac.zip', 'def456cafebabe'],
    ['Pilog-1.0.0-Setup.exe', 'ghi789feedface']
  ])

  const channel = buildChannel({
    version: '1.0.0',
    releaseUrl: 'https://github.com/nick-neely/pilog/releases/tag/v1.0.0',
    publishedAt: '2026-06-01T12:00:00Z',
    assets: stableAssets,
    checksums
  })

  it('sets version, releaseUrl, and publishedAt', () => {
    expect(channel.version).toBe('1.0.0')
    expect(channel.releaseUrl).toBe('https://github.com/nick-neely/pilog/releases/tag/v1.0.0')
    expect(channel.publishedAt).toBe('2026-06-01T12:00:00Z')
  })

  it('groups artifacts into platforms in canonical order (macos, windows, linux)', () => {
    const platformIds = channel.platforms.map((p) => p.platform)
    expect(platformIds).toEqual(['macos', 'windows', 'linux'])
  })

  it('includes only artifact assets (no checksums, yml, or txt files)', () => {
    const allNames = channel.platforms.flatMap((p) => p.artifacts.map((a) => a.fileName))
    expect(allNames).not.toContain('Pilog-1.0.0.dmg.sha256')
    expect(allNames).not.toContain('latest-mac.yml')
    expect(allNames).not.toContain('checksums-mac.txt')
  })

  it('attaches sha256 checksums where available', () => {
    const macos = channel.platforms.find((p) => p.platform === 'macos')!
    const dmg = macos.artifacts.find((a) => a.fileName === 'Pilog-1.0.0.dmg')!
    expect(dmg.sha256).toBe('abc123deadbeef')
    const exe = channel.platforms.find((p) => p.platform === 'windows')!.artifacts[0]
    expect(exe.sha256).toBe('ghi789feedface')
  })

  it('leaves sha256 undefined when no checksum is available', () => {
    const linux = channel.platforms.find((p) => p.platform === 'linux')!
    const appImage = linux.artifacts.find((a) => a.fileName === 'Pilog-1.0.0.AppImage')!
    expect(appImage.sha256).toBeUndefined()
  })

  it('attaches the download URL and file size to each artifact', () => {
    const win = channel.platforms.find((p) => p.platform === 'windows')!
    const exe = win.artifacts[0]
    expect(exe.downloadUrl).toBe(
      'https://github.com/nick-neely/pilog/releases/download/v1.0.0/Pilog-1.0.0-Setup.exe'
    )
    expect(exe.fileSize).toBe(90000)
  })

  it('sets correct platform labels and descriptions', () => {
    const macos = channel.platforms.find((p) => p.platform === 'macos')!
    expect(macos.label).toBe('macOS')
    expect(macos.description).toContain('Apple Silicon')

    const win = channel.platforms.find((p) => p.platform === 'windows')!
    expect(win.label).toBe('Windows')
    expect(win.description).toContain('Windows')

    const linux = channel.platforms.find((p) => p.platform === 'linux')!
    expect(linux.label).toBe('Linux')
  })

  it('produces a manifest-valid channel when embedded in a manifest', () => {
    const manifest: ReleaseManifest = { schemaVersion: 1, stable: channel, preview: null }
    expect(validateReleaseManifest(manifest)).toEqual([])
  })

  it('omits platforms that have no matching artifacts', () => {
    const macOnlyAssets: AssetInfo[] = [
      {
        name: 'Pilog-1.0.0.dmg',
        downloadUrl: 'https://example.com/Pilog-1.0.0.dmg',
        fileSize: 100000
      }
    ]
    const ch = buildChannel({
      version: '1.0.0',
      releaseUrl: 'https://example.com/releases/tag/v1.0.0',
      publishedAt: '2026-06-01T12:00:00Z',
      assets: macOnlyAssets,
      checksums: new Map()
    })
    const platformIds = ch.platforms.map((p) => p.platform)
    expect(platformIds).toEqual(['macos'])
    expect(platformIds).not.toContain('windows')
    expect(platformIds).not.toContain('linux')
  })

  it('handles preview artifacts correctly', () => {
    const previewAssets: AssetInfo[] = [
      {
        name: 'Pilog-0.1.0-preview.dmg',
        downloadUrl: 'https://example.com/Pilog-0.1.0-preview.dmg',
        fileSize: 100000
      },
      {
        name: 'Pilog-0.1.0-preview-mac.zip',
        downloadUrl: 'https://example.com/Pilog-0.1.0-preview-mac.zip',
        fileSize: 80000
      },
      {
        name: 'Pilog-0.1.0-preview-Setup.exe',
        downloadUrl: 'https://example.com/Pilog-0.1.0-preview-Setup.exe',
        fileSize: 90000
      }
    ]
    const ch = buildChannel({
      version: '0.1.0-preview.1',
      releaseUrl: 'https://example.com/releases/tag/v0.1.0-preview.1',
      publishedAt: '2026-05-11T00:00:00Z',
      assets: previewAssets,
      checksums: new Map()
    })
    const platformIds = ch.platforms.map((p) => p.platform)
    expect(platformIds).toContain('macos')
    expect(platformIds).toContain('windows')
    const macos = ch.platforms.find((p) => p.platform === 'macos')!
    expect(macos.artifacts.map((a) => a.fileName)).toContain('Pilog-0.1.0-preview.dmg')
    const manifest: ReleaseManifest = { schemaVersion: 1, stable: null, preview: ch }
    expect(validateReleaseManifest(manifest)).toEqual([])
  })
})

describe('updateManifest', () => {
  const baseManifest: ReleaseManifest = { schemaVersion: 1, stable: null, preview: null }

  const channel = {
    version: '1.0.0',
    releaseUrl: 'https://github.com/nick-neely/pilog/releases/tag/v1.0.0',
    publishedAt: '2026-06-01T12:00:00Z',
    platforms: []
  }

  it('sets the stable channel', () => {
    const updated = updateManifest(baseManifest, 'stable', channel)
    expect(updated.stable).toBe(channel)
    expect(updated.preview).toBeNull()
    expect(updated.schemaVersion).toBe(1)
  })

  it('sets the preview channel', () => {
    const updated = updateManifest(baseManifest, 'preview', channel)
    expect(updated.preview).toBe(channel)
    expect(updated.stable).toBeNull()
  })

  it('replaces an existing channel entry without touching the other channel', () => {
    const existing: ReleaseManifest = {
      schemaVersion: 1,
      stable: { version: '0.9.0', releaseUrl: 'https://example.com', platforms: [] },
      preview: { version: '0.9.0-preview.1', releaseUrl: 'https://example.com', platforms: [] }
    }
    const updated = updateManifest(existing, 'stable', channel)
    expect(updated.stable?.version).toBe('1.0.0')
    expect(updated.preview?.version).toBe('0.9.0-preview.1')
  })

  it('does not mutate the original manifest', () => {
    updateManifest(baseManifest, 'stable', channel)
    expect(baseManifest.stable).toBeNull()
  })

  it('preserves schemaVersion', () => {
    const updated = updateManifest(baseManifest, 'stable', channel)
    expect(updated.schemaVersion).toBe(baseManifest.schemaVersion)
  })
})
