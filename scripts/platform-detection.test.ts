import { describe, expect, it } from 'vitest'
import type { ReleaseChannel, ReleaseManifest } from '../site/src/lib/release-manifest'
import {
  detectPlatform,
  getAlternatePrimaryRelease,
  getLinuxRelease,
  getPrimaryPlatforms,
  getPrimaryRelease,
  isPrimaryPlatform,
  sortPlatformsForDetected
} from '../site/src/lib/platform'
import placeholderManifest from '../site/src/data/release-manifest.json'

const manifest = placeholderManifest as ReleaseManifest

const macUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const winUA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const linuxUA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const iosUA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

const fullChannel: ReleaseChannel = {
  version: '1.0.0',
  releaseUrl: 'https://github.com/nick-neely/pilog/releases/tag/v1.0.0',
  publishedAt: '2026-06-01T00:00:00Z',
  platforms: [
    {
      platform: 'macos',
      label: 'macOS',
      description: 'Universal build.',
      artifacts: [
        {
          fileName: 'Pilog-1.0.0.dmg',
          downloadUrl: 'https://example.com/Pilog-1.0.0.dmg',
          label: 'DMG installer',
          sha256: 'abc123'
        }
      ]
    },
    {
      platform: 'windows',
      label: 'Windows',
      description: '64-bit installer.',
      artifacts: [
        {
          fileName: 'Pilog-1.0.0-Setup.exe',
          downloadUrl: 'https://example.com/Pilog-1.0.0-Setup.exe',
          label: 'Installer',
          sha256: 'def456'
        }
      ]
    },
    {
      platform: 'linux',
      label: 'Linux',
      description: 'AppImage and .deb packages.',
      artifacts: [
        {
          fileName: 'Pilog-1.0.0.AppImage',
          downloadUrl: 'https://example.com/Pilog-1.0.0.AppImage',
          label: 'AppImage',
          sha256: 'ghi789'
        }
      ]
    }
  ]
}

const macOnlyChannel: ReleaseChannel = {
  version: '1.0.0',
  releaseUrl: 'https://github.com/nick-neely/pilog/releases/tag/v1.0.0',
  platforms: [
    {
      platform: 'macos',
      label: 'macOS',
      description: 'Universal build.',
      artifacts: [
        {
          fileName: 'Pilog-1.0.0.dmg',
          downloadUrl: 'https://example.com/Pilog-1.0.0.dmg',
          label: 'DMG installer'
        }
      ]
    }
  ]
}

describe('detectPlatform', () => {
  it('detects macOS from user agent', () => {
    expect(detectPlatform(macUA)).toBe('macos')
  })

  it('detects Windows from user agent', () => {
    expect(detectPlatform(winUA)).toBe('windows')
  })

  it('detects Linux from user agent', () => {
    expect(detectPlatform(linuxUA)).toBe('linux')
  })

  it('returns unknown for empty user agent', () => {
    expect(detectPlatform('')).toBe('unknown')
  })

  it('returns unknown for undefined user agent in non-browser env', () => {
    expect(detectPlatform(undefined)).toBe('unknown')
  })

  it('detects macOS from iOS user agent (contains Mac OS X)', () => {
    expect(detectPlatform(iosUA)).toBe('macos')
  })
})

describe('isPrimaryPlatform', () => {
  it('macOS is primary', () => {
    expect(isPrimaryPlatform('macos')).toBe(true)
  })

  it('Windows is primary', () => {
    expect(isPrimaryPlatform('windows')).toBe(true)
  })

  it('Linux is not primary', () => {
    expect(isPrimaryPlatform('linux')).toBe(false)
  })

  it('unknown is not primary', () => {
    expect(isPrimaryPlatform('unknown')).toBe(false)
  })
})

describe('getPrimaryRelease', () => {
  it('returns macOS release when detected platform is macOS', () => {
    const release = getPrimaryRelease(fullChannel, 'macos')
    expect(release).not.toBeNull()
    expect(release!.platform).toBe('macos')
  })

  it('returns Windows release when detected platform is Windows', () => {
    const release = getPrimaryRelease(fullChannel, 'windows')
    expect(release).not.toBeNull()
    expect(release!.platform).toBe('windows')
  })

  it('returns null when detected platform is Linux', () => {
    expect(getPrimaryRelease(fullChannel, 'linux')).toBeNull()
  })

  it('returns null when detected platform is unknown', () => {
    expect(getPrimaryRelease(fullChannel, 'unknown')).toBeNull()
  })

  it('returns null when detected platform has no matching release in manifest', () => {
    expect(getPrimaryRelease(macOnlyChannel, 'windows')).toBeNull()
  })
})

describe('getAlternatePrimaryRelease', () => {
  it('returns Windows when detected is macOS', () => {
    const alt = getAlternatePrimaryRelease(fullChannel, 'macos')
    expect(alt).not.toBeNull()
    expect(alt!.platform).toBe('windows')
  })

  it('returns macOS when detected is Windows', () => {
    const alt = getAlternatePrimaryRelease(fullChannel, 'windows')
    expect(alt).not.toBeNull()
    expect(alt!.platform).toBe('macos')
  })

  it('returns null when detected is Linux', () => {
    expect(getAlternatePrimaryRelease(fullChannel, 'linux')).toBeNull()
  })

  it('returns null when detected is unknown', () => {
    expect(getAlternatePrimaryRelease(fullChannel, 'unknown')).toBeNull()
  })

  it('returns macOS as alternate even from mac-only channel when detected is Windows', () => {
    const alt = getAlternatePrimaryRelease(macOnlyChannel, 'windows')
    expect(alt).not.toBeNull()
    expect(alt!.platform).toBe('macos')
  })

  it('returns null when alternate platform is missing from channel', () => {
    const winOnlyChannel: ReleaseChannel = {
      version: '1.0.0',
      releaseUrl: 'https://example.com',
      platforms: [
        {
          platform: 'windows',
          label: 'Windows',
          description: '64-bit installer.',
          artifacts: []
        }
      ]
    }
    expect(getAlternatePrimaryRelease(winOnlyChannel, 'windows')).toBeNull()
  })
})

describe('getLinuxRelease', () => {
  it('returns the Linux release when present', () => {
    const linux = getLinuxRelease(fullChannel)
    expect(linux).not.toBeNull()
    expect(linux!.platform).toBe('linux')
  })

  it('returns null when no Linux release exists', () => {
    expect(getLinuxRelease(macOnlyChannel)).toBeNull()
  })
})

describe('getPrimaryPlatforms', () => {
  it('returns macOS and Windows from full channel', () => {
    const primaries = getPrimaryPlatforms(fullChannel)
    expect(primaries).toHaveLength(2)
    expect(primaries.map((p) => p.platform)).toEqual(['macos', 'windows'])
  })

  it('excludes Linux from primary platforms', () => {
    const primaries = getPrimaryPlatforms(fullChannel)
    expect(primaries.every((p) => p.platform !== 'linux')).toBe(true)
  })

  it('returns only available primaries from partial channel', () => {
    const primaries = getPrimaryPlatforms(macOnlyChannel)
    expect(primaries).toHaveLength(1)
    expect(primaries[0].platform).toBe('macos')
  })
})

describe('placeholder manifest platform selection', () => {
  it('placeholder has preview channel with all three platforms', () => {
    expect(manifest.preview).not.toBeNull()
    const platforms = manifest.preview!.platforms.map((p) => p.platform)
    expect(platforms).toContain('macos')
    expect(platforms).toContain('windows')
    expect(platforms).toContain('linux')
  })

  it('getPrimaryPlatforms returns macOS and Windows from placeholder preview', () => {
    const primaries = getPrimaryPlatforms(manifest.preview!)
    expect(primaries).toHaveLength(2)
    const ids = primaries.map((p) => p.platform)
    expect(ids).toContain('macos')
    expect(ids).toContain('windows')
  })

  it('getLinuxRelease returns Linux from placeholder preview', () => {
    const linux = getLinuxRelease(manifest.preview!)
    expect(linux).not.toBeNull()
    expect(linux!.artifacts.length).toBeGreaterThan(0)
  })
})

describe('sortPlatformsForDetected', () => {
  it('places detected platform first', () => {
    const sorted = sortPlatformsForDetected(fullChannel.platforms, 'windows')
    expect(sorted[0].platform).toBe('windows')
  })

  it('preserves relative order of non-detected platforms', () => {
    const sorted = sortPlatformsForDetected(fullChannel.platforms, 'windows')
    const rest = sorted.slice(1).map((p) => p.platform)
    expect(rest).toEqual(['macos', 'linux'])
  })

  it('does not mutate the original array', () => {
    const original = [...fullChannel.platforms]
    sortPlatformsForDetected(fullChannel.platforms, 'linux')
    expect(fullChannel.platforms.map((p) => p.platform)).toEqual(original.map((p) => p.platform))
  })

  it('returns unchanged order when detected is unknown', () => {
    const sorted = sortPlatformsForDetected(fullChannel.platforms, 'unknown')
    expect(sorted.map((p) => p.platform)).toEqual(['macos', 'windows', 'linux'])
  })
})

describe('download page: platform selection logic', () => {
  it('macOS user sees macOS as primary, Windows as alternate', () => {
    const detected = detectPlatform(macUA)
    const primary = getPrimaryRelease(fullChannel, detected)
    const alternate = getAlternatePrimaryRelease(fullChannel, detected)
    expect(primary!.platform).toBe('macos')
    expect(alternate!.platform).toBe('windows')
  })

  it('Windows user sees Windows as primary, macOS as alternate', () => {
    const detected = detectPlatform(winUA)
    const primary = getPrimaryRelease(fullChannel, detected)
    const alternate = getAlternatePrimaryRelease(fullChannel, detected)
    expect(primary!.platform).toBe('windows')
    expect(alternate!.platform).toBe('macos')
  })

  it('Linux user sees no primary (falls back to showing all primaries)', () => {
    const detected = detectPlatform(linuxUA)
    const primary = getPrimaryRelease(fullChannel, detected)
    expect(primary).toBeNull()
    const primaries = getPrimaryPlatforms(fullChannel)
    expect(primaries).toHaveLength(2)
  })

  it('unknown user sees no primary (falls back to showing all primaries)', () => {
    const detected = detectPlatform('')
    const primary = getPrimaryRelease(fullChannel, detected)
    expect(primary).toBeNull()
    const primaries = getPrimaryPlatforms(fullChannel)
    expect(primaries).toHaveLength(2)
  })
})

describe('Other Platforms fallback', () => {
  it('all platforms are available through channel.platforms regardless of detection', () => {
    expect(fullChannel.platforms).toHaveLength(3)
    const platformIds = fullChannel.platforms.map((p) => p.platform)
    expect(platformIds).toContain('macos')
    expect(platformIds).toContain('windows')
    expect(platformIds).toContain('linux')
  })

  it('every artifact has a downloadUrl for the All Downloads section', () => {
    for (const platform of fullChannel.platforms) {
      for (const artifact of platform.artifacts) {
        expect(artifact.downloadUrl).toBeTruthy()
      }
    }
  })

  it('checksums are accessible on artifacts that have them', () => {
    const mac = fullChannel.platforms.find((p) => p.platform === 'macos')!
    expect(mac.artifacts[0].sha256).toBe('abc123')
  })
})

describe('missing-artifact fallback', () => {
  const emptyChannel: ReleaseChannel = {
    version: '1.0.0',
    releaseUrl: 'https://example.com',
    platforms: [
      {
        platform: 'macos',
        label: 'macOS',
        description: 'Universal build.',
        artifacts: []
      }
    ]
  }

  it('getPrimaryRelease returns the platform even with empty artifacts', () => {
    const primary = getPrimaryRelease(emptyChannel, 'macos')
    expect(primary).not.toBeNull()
    expect(primary!.artifacts).toHaveLength(0)
  })

  it('primary CTA should not render when artifacts array is empty', () => {
    const primary = getPrimaryRelease(emptyChannel, 'macos')
    const firstArtifact = primary!.artifacts[0]
    expect(firstArtifact).toBeUndefined()
  })
})

describe('preview channel: caveat requirements', () => {
  it('placeholder preview channel is marked as preview in version string', () => {
    expect(manifest.preview!.version).toContain('preview')
  })

  it('preview platform descriptions mention unsigned status', () => {
    const mac = manifest.preview!.platforms.find((p) => p.platform === 'macos')
    expect(mac!.description.toLowerCase()).toContain('unsigned')
  })

  it('preview has a GitHub Release URL for transparency', () => {
    expect(manifest.preview!.releaseUrl).toContain('github.com')
  })

  it('stable is null — download page should show no-release fallback', () => {
    expect(manifest.stable).toBeNull()
  })
})
