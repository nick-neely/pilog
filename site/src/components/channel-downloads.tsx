import Link from 'next/link'
import type { ReleaseChannel } from '@/lib/release-manifest'

export function ChannelDownloads({ channel }: { channel: ReleaseChannel }) {
  return (
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
  )
}
