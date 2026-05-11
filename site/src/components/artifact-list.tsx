import Link from 'next/link'
import type { PlatformRelease, ReleaseArtifact } from '@/lib/release-manifest'

export function ArtifactRow({ artifact }: { artifact: ReleaseArtifact }) {
  return (
    <li className="flex flex-col gap-0.5">
      <Link
        href={artifact.downloadUrl}
        className="text-primary hover:text-primary/80 font-mono text-sm underline underline-offset-4"
      >
        {artifact.label ?? artifact.fileName}
      </Link>
      {artifact.sha256 && (
        <span className="text-muted-foreground font-mono text-xs break-all">
          SHA-256: {artifact.sha256}
        </span>
      )}
      {artifact.fileSize !== undefined && (
        <span className="text-muted-foreground text-xs">
          {(artifact.fileSize / 1_048_576).toFixed(1)} MB
        </span>
      )}
    </li>
  )
}

export function PlatformSection({
  release,
  headingLevel: Heading = 'h2'
}: {
  release: PlatformRelease
  headingLevel?: 'h2' | 'h3'
}) {
  return (
    <div className="border-border rounded-lg border p-5">
      <Heading className="text-foreground text-base font-semibold">{release.label}</Heading>
      <p className="text-muted-foreground mt-1 text-sm">{release.description}</p>

      {release.artifacts.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm italic">
          No artifacts available for this platform.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {release.artifacts.map((artifact) => (
            <ArtifactRow key={artifact.fileName} artifact={artifact} />
          ))}
        </ul>
      )}
    </div>
  )
}
