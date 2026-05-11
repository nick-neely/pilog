'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ReleaseChannel } from '@/lib/release-manifest'
import {
  detectPlatform,
  getPrimaryRelease,
  sortPlatformsForDetected,
  type DetectedPlatform
} from '@/lib/platform'
import { PlatformSection } from './artifact-list'

export function PreviewDownload({ channel }: { channel: ReleaseChannel }) {
  const [detected, setDetected] = useState<DetectedPlatform>('unknown')

  useEffect(() => {
    setDetected(detectPlatform())
  }, [])

  const primary = getPrimaryRelease(channel, detected)
  const sortedPlatforms = sortPlatformsForDetected(channel.platforms, detected)

  return (
    <>
      <div className="border-border mt-6 flex items-baseline gap-3 rounded-lg border p-5">
        <span className="text-foreground font-mono text-sm font-medium">
          v{channel.version}
        </span>
        <span className="bg-secondary text-muted-foreground rounded px-1.5 py-0.5 font-mono text-xs">
          preview
        </span>
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

      {primary && (
        <p className="text-muted-foreground mt-4 text-sm">
          Detected platform: <span className="text-foreground font-medium">{primary.label}</span>
        </p>
      )}

      <div className="mt-4 space-y-4">
        {sortedPlatforms.map((platform) => (
          <PlatformSection key={platform.platform} release={platform} />
        ))}
      </div>
    </>
  )
}
