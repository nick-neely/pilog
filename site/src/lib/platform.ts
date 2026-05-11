import type { PlatformRelease, ReleaseChannel } from './release-manifest'

export type DetectedPlatform = 'macos' | 'windows' | 'linux' | 'unknown'

const PRIMARY_PLATFORMS: ReadonlySet<DetectedPlatform> = new Set(['macos', 'windows'])

export function detectPlatform(userAgent?: string): DetectedPlatform {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macos'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return 'linux'
  return 'unknown'
}

export function isPrimaryPlatform(platform: DetectedPlatform): boolean {
  return PRIMARY_PLATFORMS.has(platform)
}

export function getPrimaryRelease(
  channel: ReleaseChannel,
  detected: DetectedPlatform
): PlatformRelease | null {
  if (!isPrimaryPlatform(detected)) return null
  return channel.platforms.find((p) => p.platform === detected) ?? null
}

export function getAlternatePrimaryRelease(
  channel: ReleaseChannel,
  detected: DetectedPlatform
): PlatformRelease | null {
  if (detected === 'macos') return channel.platforms.find((p) => p.platform === 'windows') ?? null
  if (detected === 'windows') return channel.platforms.find((p) => p.platform === 'macos') ?? null
  return null
}

export function getLinuxRelease(channel: ReleaseChannel): PlatformRelease | null {
  return channel.platforms.find((p) => p.platform === 'linux') ?? null
}

export function getPrimaryPlatforms(channel: ReleaseChannel): PlatformRelease[] {
  return channel.platforms.filter((p) => p.platform === 'macos' || p.platform === 'windows')
}

export function sortPlatformsForDetected(
  platforms: PlatformRelease[],
  detected: DetectedPlatform
): PlatformRelease[] {
  return [...platforms].sort((a, b) => {
    if (a.platform === detected) return -1
    if (b.platform === detected) return 1
    return 0
  })
}
