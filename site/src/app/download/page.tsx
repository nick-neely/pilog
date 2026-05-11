import type { Metadata } from 'next'
import Link from 'next/link'
import { ChannelDownloads } from '@/components/channel-downloads'
import type { ReleaseManifest } from '@/lib/release-manifest'
import rawManifest from '@/data/release-manifest.json'

export const metadata: Metadata = {
  title: 'Download'
}

const manifest = rawManifest as ReleaseManifest
const channel = manifest.stable

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight">
        Download Pilog
      </h1>
      <p className="text-muted-foreground mt-4 text-base leading-relaxed">
        Pilog is available for macOS and Windows. Linux builds are available as secondary downloads.
      </p>

      {channel === null ? (
        <div className="border-border bg-secondary/50 mt-10 rounded-lg border p-5">
          <p className="text-foreground text-sm font-medium">No stable release yet.</p>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            The first stable release hasn&apos;t been published. Check back soon, or try a{' '}
            <Link
              href="/preview"
              className="text-primary hover:text-primary/80 underline underline-offset-4"
            >
              preview build
            </Link>{' '}
            in the meantime.
          </p>
        </div>
      ) : (
        <ChannelDownloads channel={channel} />
      )}

      <p className="text-muted-foreground mt-8 text-sm">
        Looking for pre-release builds?{' '}
        <Link href="/preview" className="text-primary hover:text-primary/80 underline underline-offset-4">
          Preview downloads
        </Link>
      </p>
    </div>
  )
}
