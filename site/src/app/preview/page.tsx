import type { Metadata } from 'next'
import Link from 'next/link'
import { ChannelDownloads } from '@/components/channel-downloads'
import type { ReleaseManifest } from '@/lib/release-manifest'
import rawManifest from '@/data/release-manifest.json'

export const metadata: Metadata = {
  title: 'Preview Downloads',
  robots: { index: false }
}

const manifest = rawManifest as ReleaseManifest
const channel = manifest.preview

export default function PreviewPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight">
        Preview Downloads
      </h1>

      <div className="border-border bg-secondary/50 mt-6 rounded-lg border p-5">
        <p className="text-foreground text-sm font-medium">These builds are not signed.</p>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Preview builds may contain bugs and are not code-signed or notarized. Your OS will likely
          show a security warning. Use these only if you are comfortable running unsigned software.
        </p>
      </div>

      {channel === null ? (
        <div className="border-border bg-secondary/50 mt-6 rounded-lg border p-5">
          <p className="text-foreground text-sm font-medium">No preview builds yet.</p>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Preview builds will appear here once the first pre-release is published.
          </p>
        </div>
      ) : (
        <ChannelDownloads channel={channel} />
      )}

      <p className="text-muted-foreground mt-8 text-sm">
        Looking for stable releases?{' '}
        <Link href="/download" className="text-primary hover:text-primary/80 underline underline-offset-4">
          Stable downloads
        </Link>
      </p>
    </div>
  )
}
