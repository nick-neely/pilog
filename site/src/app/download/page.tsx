import type { Metadata } from 'next'
import Link from 'next/link'
import { PlatformDownload } from '@/components/platform-download'
import { downloadMetadata } from '@/lib/metadata'
import type { ReleaseManifest } from '@/lib/release-manifest'
import rawManifest from '@/data/release-manifest.json'

export const metadata: Metadata = downloadMetadata

const manifest = rawManifest as ReleaseManifest
const channel = manifest.stable

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight">
        Download Pilog
      </h1>
      <p className="text-muted-foreground mt-4 text-base leading-relaxed">
        Available for macOS and Windows. Linux builds are provided as secondary downloads.
      </p>

      {channel === null ? (
        <div className="border-border mt-10 rounded-lg border p-6">
          <p className="font-heading text-foreground text-xl font-normal tracking-tight">
            No stable release yet.
          </p>
          <p className="text-muted-foreground mt-2 max-w-[52ch] text-sm leading-relaxed">
            The first stable release hasn&apos;t been published. Preview builds are available now
            and include all current features. They are unsigned pre-release software, so your OS
            will show a security warning on install.
          </p>
          <div className="mt-5">
            <Link
              href="/preview"
              className="bg-primary text-primary-foreground hover:bg-primary/80 focus-visible:ring-ring/30 focus-visible:border-ring inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium focus-visible:ring-3 focus-visible:outline-none active:translate-y-px"
            >
              Browse preview builds
            </Link>
          </div>
        </div>
      ) : (
        <>
          <PlatformDownload channel={channel} />
          <p className="text-muted-foreground mt-10 text-sm">
            Looking for pre-release builds?{' '}
            <Link
              href="/preview"
              className="text-primary hover:text-primary/80 underline underline-offset-4"
            >
              Preview downloads
            </Link>
          </p>
        </>
      )}
    </div>
  )
}
