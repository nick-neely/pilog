import type { Metadata } from 'next'
import Link from 'next/link'
import { PreviewDownload } from '@/components/preview-download'
import { previewMetadata } from '@/lib/metadata'
import type { ReleaseManifest } from '@/lib/release-manifest'
import rawManifest from '@/data/release-manifest.json'

export const metadata: Metadata = previewMetadata

const manifest = rawManifest as ReleaseManifest
const channel = manifest.preview

export default function PreviewPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight">
        Preview Downloads
      </h1>
      <p className="text-muted-foreground mt-4 text-base leading-relaxed">
        Early builds for testing. These are not stable releases.
      </p>

      <div className="border-border bg-secondary/50 mt-6 rounded-lg border p-5" role="status">
        <p className="text-foreground text-sm font-medium">Before you install</p>
        <ul className="text-muted-foreground mt-2 list-inside list-disc space-y-1 text-sm leading-relaxed">
          <li>
            Preview builds are not code-signed or notarized. Your OS will show a security warning.
          </li>
          <li>These builds may contain bugs, incomplete features, or breaking changes.</li>
          <li>Data created in a preview build may not migrate to the stable release.</li>
          <li>Use these only if you are comfortable running unsigned pre-release software.</li>
        </ul>
      </div>

      {channel === null ? (
        <div className="border-border bg-secondary/50 mt-6 rounded-lg border p-5">
          <p className="text-foreground text-sm font-medium">No preview builds yet</p>
          <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
            Preview builds will appear here once the first pre-release is published.
          </p>
        </div>
      ) : (
        <PreviewDownload channel={channel} />
      )}

      <p className="text-muted-foreground mt-10 text-sm">
        Looking for stable releases?{' '}
        <Link
          href="/download"
          className="text-primary hover:text-primary/80 underline underline-offset-4"
        >
          Stable downloads
        </Link>
      </p>
    </div>
  )
}
