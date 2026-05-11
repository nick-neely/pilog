import { describe, expect, it } from 'vitest'
import placeholderManifest from '../site/src/data/release-manifest.json'
import {
  isValidReleaseManifest,
  validateReleaseManifest,
  type ReleaseManifest
} from '../site/src/lib/release-manifest'

describe('validateReleaseManifest', () => {
  it('accepts the placeholder manifest', () => {
    const errors = validateReleaseManifest(placeholderManifest)
    expect(errors).toEqual([])
  })

  it('rejects a non-object', () => {
    expect(validateReleaseManifest(null)).toEqual([
      { path: '', message: 'manifest must be an object' }
    ])
    expect(validateReleaseManifest('string')).toEqual([
      { path: '', message: 'manifest must be an object' }
    ])
  })

  it('rejects a missing schemaVersion', () => {
    const errors = validateReleaseManifest({ stable: null, preview: null })
    expect(errors.some((e) => e.path === 'schemaVersion')).toBe(true)
  })

  it('rejects schemaVersion of 0', () => {
    const errors = validateReleaseManifest({ schemaVersion: 0, stable: null, preview: null })
    expect(errors.some((e) => e.path === 'schemaVersion')).toBe(true)
  })

  it('rejects missing stable field', () => {
    const errors = validateReleaseManifest({ schemaVersion: 1, preview: null })
    expect(errors.some((e) => e.path === 'stable')).toBe(true)
  })

  it('rejects missing preview field', () => {
    const errors = validateReleaseManifest({ schemaVersion: 1, stable: null })
    expect(errors.some((e) => e.path === 'preview')).toBe(true)
  })

  it('accepts null for stable and preview (no release yet)', () => {
    const errors = validateReleaseManifest({ schemaVersion: 1, stable: null, preview: null })
    expect(errors).toEqual([])
  })

  it('validates a well-formed channel', () => {
    const manifest: ReleaseManifest = {
      schemaVersion: 1,
      stable: {
        version: '1.0.0',
        releaseUrl: 'https://github.com/nick-neely/pilog/releases/tag/v1.0.0',
        publishedAt: '2026-06-01T12:00:00Z',
        platforms: [
          {
            platform: 'macos',
            label: 'macOS',
            description: 'Universal build.',
            artifacts: [
              {
                fileName: 'Pilog-1.0.0.dmg',
                downloadUrl: 'https://github.com/nick-neely/pilog/releases/download/v1.0.0/Pilog-1.0.0.dmg',
                label: 'DMG installer',
                sha256: 'abc123'
              }
            ]
          }
        ]
      },
      preview: null
    }
    expect(validateReleaseManifest(manifest)).toEqual([])
  })

  it('rejects a channel with missing version', () => {
    const errors = validateReleaseManifest({
      schemaVersion: 1,
      stable: { releaseUrl: 'https://example.com', platforms: [] },
      preview: null
    })
    expect(errors.some((e) => e.path === 'stable.version')).toBe(true)
  })

  it('rejects a channel with missing releaseUrl', () => {
    const errors = validateReleaseManifest({
      schemaVersion: 1,
      stable: { version: '1.0.0', platforms: [] },
      preview: null
    })
    expect(errors.some((e) => e.path === 'stable.releaseUrl')).toBe(true)
  })

  it('rejects a channel with non-array platforms', () => {
    const errors = validateReleaseManifest({
      schemaVersion: 1,
      stable: { version: '1.0.0', releaseUrl: 'https://example.com', platforms: 'bad' },
      preview: null
    })
    expect(errors.some((e) => e.path === 'stable.platforms')).toBe(true)
  })

  it('rejects a platform with invalid platform value', () => {
    const errors = validateReleaseManifest({
      schemaVersion: 1,
      stable: {
        version: '1.0.0',
        releaseUrl: 'https://example.com',
        platforms: [{ platform: 'beos', label: 'BeOS', description: 'Old OS.', artifacts: [] }]
      },
      preview: null
    })
    expect(errors.some((e) => e.path === 'stable.platforms[0].platform')).toBe(true)
  })

  it('rejects an artifact with missing downloadUrl', () => {
    const errors = validateReleaseManifest({
      schemaVersion: 1,
      stable: {
        version: '1.0.0',
        releaseUrl: 'https://example.com',
        platforms: [
          {
            platform: 'macos',
            label: 'macOS',
            description: 'desc',
            artifacts: [{ fileName: 'Pilog.dmg' }]
          }
        ]
      },
      preview: null
    })
    expect(errors.some((e) => e.path === 'stable.platforms[0].artifacts[0].downloadUrl')).toBe(true)
  })
})

describe('isValidReleaseManifest', () => {
  it('returns true for the placeholder manifest', () => {
    expect(isValidReleaseManifest(placeholderManifest)).toBe(true)
  })

  it('returns false for invalid input', () => {
    expect(isValidReleaseManifest(null)).toBe(false)
    expect(isValidReleaseManifest({})).toBe(false)
    expect(isValidReleaseManifest({ schemaVersion: 1 })).toBe(false)
  })
})

describe('placeholder manifest shape', () => {
  it('has schemaVersion 1', () => {
    expect(placeholderManifest.schemaVersion).toBe(1)
  })

  it('has null stable (no stable release yet)', () => {
    expect(placeholderManifest.stable).toBeNull()
  })

  it('has a preview channel with version 0.1.0-preview.1', () => {
    expect(placeholderManifest.preview).not.toBeNull()
    expect(placeholderManifest.preview?.version).toBe('0.1.0-preview.1')
  })

  it('preview channel has artifacts for all three platforms', () => {
    const platforms = placeholderManifest.preview?.platforms ?? []
    const platformIds = platforms.map((p) => p.platform)
    expect(platformIds).toContain('macos')
    expect(platformIds).toContain('windows')
    expect(platformIds).toContain('linux')
  })

  it('every artifact has a non-empty fileName and downloadUrl', () => {
    const platforms = placeholderManifest.preview?.platforms ?? []
    for (const platform of platforms) {
      for (const artifact of platform.artifacts) {
        expect(artifact.fileName.length).toBeGreaterThan(0)
        expect(artifact.downloadUrl.length).toBeGreaterThan(0)
      }
    }
  })

  it('artifact file names follow the preview naming convention', () => {
    const platforms = placeholderManifest.preview?.platforms ?? []
    for (const platform of platforms) {
      for (const artifact of platform.artifacts) {
        expect(artifact.fileName).toMatch(/preview/)
      }
    }
  })
})
