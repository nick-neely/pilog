import type { Metadata } from 'next'
import Link from 'next/link'
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
        <>
          <div className="border-border mt-6 flex items-baseline gap-3 rounded-lg border p-5">
            <span className="text-foreground font-mono text-sm font-medium">
              v{channel.version}
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

          <div className="mt-6 space-y-4">
            {channel.platforms.map((platform) => (
              <div key={platform.platform} className="border-border rounded-lg border p-5">
                <h2 className="text-foreground text-base font-semibold">{platform.label}</h2>
                <p className="text-muted-foreground mt-1 text-sm">{platform.description}</p>

                {platform.artifacts.length === 0 ? (
                  <p className="text-muted-foreground mt-3 text-sm italic">
                    No artifacts available for this platform.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {platform.artifacts.map((artifact) => (
                      <li key={artifact.fileName} className="flex flex-col gap-0.5">
                        <Link
                          href={artifact.downloadUrl}
                          className="text-primary hover:text-primary/80 font-mono text-sm underline underline-offset-4"
                        >
                          {artifact.label ?? artifact.fileName}
                        </Link>
                        {artifact.sha256 && (
                          <span className="text-muted-foreground font-mono text-xs">
                            SHA-256: {artifact.sha256}
                          </span>
                        )}
                        {artifact.fileSize !== undefined && (
                          <span className="text-muted-foreground text-xs">
                            {(artifact.fileSize / 1_048_576).toFixed(1)} MB
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </>
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
