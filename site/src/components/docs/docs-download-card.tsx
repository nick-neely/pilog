'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import type { PlatformRelease, ReleaseArtifact, ReleaseChannel } from '@/lib/release-manifest'
import { detectPlatform, type DetectedPlatform } from '@/lib/platform'

type PlatformId = 'macos' | 'windows' | 'linux'

const PLATFORM_ORDER: PlatformId[] = ['macos', 'windows', 'linux']
const PLATFORM_LABEL: Record<PlatformId, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux'
}
const PLATFORM_HINT: Record<PlatformId, string> = {
  macos: 'Open the .dmg, drag Pilog to Applications, and launch from Spotlight or Launchpad.',
  windows:
    'Run the .exe installer and follow the prompts. Pilog will be available from the Start menu.',
  linux: 'Mark the AppImage executable and run it, or install the .deb with your package manager.'
}

/**
 * Short extension chip for an artifact button: ".dmg", ".exe", "AppImage".
 * Falls back to the artifact label if no extension can be derived.
 */
function getArtifactChip(artifact: ReleaseArtifact, platform: PlatformId): string {
  const name = artifact.fileName.toLowerCase()
  if (platform === 'linux' && name.endsWith('.appimage')) return 'AppImage'
  const lastDot = name.lastIndexOf('.')
  if (lastDot >= 0 && lastDot > name.lastIndexOf('/')) {
    return name.slice(lastDot)
  }
  return artifact.label ?? artifact.fileName
}

function getArtifactArchHint(artifact: ReleaseArtifact, platform: PlatformId): string | null {
  const name = artifact.fileName.toLowerCase()
  if (platform === 'macos') {
    if (name.includes('arm64')) return 'ARM'
    if (name.includes('x64') || name.includes('intel')) return 'x64'
    return 'Universal'
  }
  if (platform === 'windows') {
    if (name.includes('arm64')) return 'ARM64'
    if (name.includes('ia32') || name.includes('x86')) return 'x86'
    return 'x64'
  }
  return null
}

function PlatformPanel({ release }: { release: PlatformRelease }) {
  const platform = release.platform as PlatformId
  return (
    <div className="px-5 py-5 sm:px-6 sm:py-6">
      <p className="text-muted-foreground font-mono text-[0.65rem] tracking-[0.12em] uppercase">
        Download
      </p>
      {release.artifacts.length === 0 ? (
        <p className="text-muted-foreground mt-3 text-sm italic">
          No artifacts available for this platform yet.
        </p>
      ) : (
        <ul role="list" className="mt-3 flex flex-wrap gap-2">
          {release.artifacts.map((artifact) => {
            const chip = getArtifactChip(artifact, platform)
            const arch = getArtifactArchHint(artifact, platform)
            return (
              <li key={artifact.fileName}>
                <Link
                  href={artifact.downloadUrl}
                  className="border-border bg-background text-foreground hover:bg-secondary/60 focus-visible:ring-ring/30 focus-visible:border-ring inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none active:translate-y-px"
                >
                  {arch && (
                    <span className="text-foreground/85 font-mono text-[0.78rem]">{arch}</span>
                  )}
                  <span className="text-muted-foreground font-mono text-[0.78rem]">{chip}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-muted-foreground mt-4 max-w-[60ch] text-sm leading-relaxed">
        {PLATFORM_HINT[platform]}
      </p>
      {platform === 'linux' && (
        <p className="text-muted-foreground/85 mt-2 max-w-[60ch] text-xs leading-relaxed">
          Linux is a community-supported target; the app needs a desktop keyring (GNOME Keyring or
          KWallet via <span className="font-mono">libsecret</span>) for secure credential storage.
        </p>
      )}
    </div>
  )
}

export function DocsDownloadCard({ channel }: { channel: ReleaseChannel }) {
  const byPlatform = useMemo(() => {
    const map = new Map<PlatformId, PlatformRelease>()
    for (const p of channel.platforms) {
      if (PLATFORM_ORDER.includes(p.platform as PlatformId)) {
        map.set(p.platform as PlatformId, p)
      }
    }
    return map
  }, [channel.platforms])

  const available = useMemo(() => PLATFORM_ORDER.filter((id) => byPlatform.has(id)), [byPlatform])
  const [detected, setDetected] = useState<DetectedPlatform>('unknown')
  const [active, setActive] = useState<PlatformId>(available[0] ?? 'macos')

  useEffect(() => {
    // One-shot client-only OS sniff. SSR can't see `navigator`, so the
    // initial render uses the first available platform; after mount we
    // promote the detected OS once. Users can still click any tab to
    // override — the radix Tabs primitive handles state from here.
    const d = detectPlatform()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetected(d)
    if (d !== 'unknown' && available.includes(d as PlatformId)) {
      setActive(d as PlatformId)
    }
  }, [available])

  const publishedLabel = channel.publishedAt
    ? new Date(channel.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    : null

  return (
    <div className="border-border bg-popover overflow-hidden rounded-xl border">
      {/* radix Tabs primitive directly — not the shadcn wrapper. The wrapper
          relies on data-horizontal/data-vertical Tailwind variants that aren't
          registered in the site's globals.css, which collapsed the panel
          beside the header instead of below it. Owning the layout here keeps
          this card legible without leaking shadcn defaults into the site. */}
      <TabsPrimitive.Root
        value={active}
        onValueChange={(v) => setActive(v as PlatformId)}
        className="flex flex-col"
      >
        <div className="border-border bg-secondary/30 flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
          <TabsPrimitive.List
            aria-label="Operating system"
            className="-mb-px flex items-end gap-1 sm:gap-2"
          >
            {available.map((id) => {
              const isDetected = detected === id
              return (
                <TabsPrimitive.Trigger
                  key={id}
                  value={id}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/30 focus-visible:border-ring data-[state=active]:text-foreground data-[state=active]:border-primary relative inline-flex items-center gap-1.5 rounded-t-sm border-b-2 border-transparent px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none"
                >
                  {PLATFORM_LABEL[id]}
                  {isDetected && (
                    <span
                      aria-hidden
                      title="Your system"
                      className="bg-primary inline-block size-1.5 shrink-0 rounded-full"
                    />
                  )}
                  {isDetected && <span className="sr-only">(your system)</span>}
                </TabsPrimitive.Trigger>
              )
            })}
          </TabsPrimitive.List>

          <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-foreground font-mono text-xs font-medium">
              v{channel.version}
            </span>
            {publishedLabel && (
              <span className="hidden font-mono text-[0.7rem] sm:inline">{publishedLabel}</span>
            )}
            <Link
              href={channel.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground text-[0.7rem] underline underline-offset-4 transition-colors"
            >
              Release notes
            </Link>
          </div>
        </div>

        {available.map((id) => {
          const release = byPlatform.get(id)
          if (!release) return null
          return (
            <TabsPrimitive.Content key={id} value={id} className="focus-visible:outline-none">
              <PlatformPanel release={release} />
            </TabsPrimitive.Content>
          )
        })}
      </TabsPrimitive.Root>
    </div>
  )
}
