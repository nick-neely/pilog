'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ReleaseChannel, PlatformRelease } from '@/lib/release-manifest'
import {
  detectPlatform,
  getPrimaryRelease,
  getAlternatePrimaryRelease,
  getLinuxRelease,
  getPrimaryPlatforms,
  type DetectedPlatform
} from '@/lib/platform'
import { PlatformSection } from './artifact-list'

function PrimaryCTA({ release }: { release: PlatformRelease }) {
  const firstArtifact = release.artifacts[0]
  if (!firstArtifact) return null

  return (
    <div className="mt-10">
      <Link
        href={firstArtifact.downloadUrl}
        className="bg-primary text-primary-foreground hover:bg-primary/80 focus-visible:ring-ring/30 focus-visible:border-ring inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-medium focus-visible:ring-3 focus-visible:outline-none active:translate-y-px"
      >
        Download for {release.label}
      </Link>
      <p className="text-muted-foreground mt-2 text-sm">
        {firstArtifact.label ?? firstArtifact.fileName}
        {release.artifacts.length > 1 && (
          <>
            {' '}
            &mdash; {release.artifacts.length - 1} other format
            {release.artifacts.length > 2 ? 's' : ''} available below
          </>
        )}
      </p>
    </div>
  )
}

function VersionBar({ channel }: { channel: ReleaseChannel }) {
  return (
    <div className="border-border mt-6 flex items-baseline gap-3 rounded-lg border p-5">
      <span className="text-foreground font-mono text-sm font-medium">v{channel.version}</span>
      {channel.publishedAt && (
        <span className="text-muted-foreground text-xs">
          {new Date(channel.publishedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </span>
      )}
      <Link
        href={channel.releaseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary/80 ml-auto text-xs underline underline-offset-4"
      >
        GitHub Release
      </Link>
    </div>
  )
}

export function PlatformDownload({ channel }: { channel: ReleaseChannel }) {
  const [detected, setDetected] = useState<DetectedPlatform>('unknown')

  useEffect(() => {
    setDetected(detectPlatform())
  }, [])

  const primary = getPrimaryRelease(channel, detected)
  const alternate = getAlternatePrimaryRelease(channel, detected)
  const primaries = getPrimaryPlatforms(channel)
  const linux = getLinuxRelease(channel)

  return (
    <>
      <VersionBar channel={channel} />

      {primary ? (
        <PrimaryCTA release={primary} />
      ) : (
        <div className="mt-10 space-y-4">
          {primaries.map((p) => (
            <PlatformSection key={p.platform} release={p} />
          ))}
          {primaries.length === 0 && (
            <p className="text-muted-foreground text-sm italic">No downloads available yet.</p>
          )}
        </div>
      )}

      {alternate && (
        <p className="text-muted-foreground mt-3 text-sm">
          Also available for{' '}
          <a
            href="#all-platforms"
            className="text-primary hover:text-primary/80 underline underline-offset-4"
          >
            {alternate.label}
          </a>
        </p>
      )}

      {linux && (
        <div className="mt-10">
          <h2 className="text-foreground font-heading text-lg font-medium">Linux</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Community-supported builds. Not a primary V1 download target.
          </p>
          <div className="mt-3">
            <PlatformSection release={linux} headingLevel="h3" />
          </div>
        </div>
      )}

      <div className="mt-10" id="all-platforms">
        <h2 className="text-foreground font-heading text-lg font-medium">All downloads</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Every artifact from this release, with checksums.
        </p>
        <div className="mt-4 space-y-4">
          {channel.platforms.map((platform) => (
            <PlatformSection key={platform.platform} release={platform} />
          ))}
        </div>
      </div>
    </>
  )
}
