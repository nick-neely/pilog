import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Preview Downloads',
  robots: { index: false }
}

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

      <div className="mt-10 space-y-4">
        <div className="border-border rounded-lg border p-5">
          <h2 className="text-foreground text-base font-semibold">macOS (Preview)</h2>
          <p className="text-muted-foreground mt-1 text-sm">Unsigned universal build.</p>
          <p className="text-muted-foreground mt-3 text-sm italic">
            Preview builds available once the first pre-release is published.
          </p>
        </div>

        <div className="border-border rounded-lg border p-5">
          <h2 className="text-foreground text-base font-semibold">Windows (Preview)</h2>
          <p className="text-muted-foreground mt-1 text-sm">Unsigned 64-bit installer.</p>
          <p className="text-muted-foreground mt-3 text-sm italic">
            Preview builds available once the first pre-release is published.
          </p>
        </div>

        <div className="border-border rounded-lg border p-5">
          <h2 className="text-foreground text-base font-semibold">Linux (Preview)</h2>
          <p className="text-muted-foreground mt-1 text-sm">AppImage and .deb packages.</p>
          <p className="text-muted-foreground mt-3 text-sm italic">
            Preview builds available once the first pre-release is published.
          </p>
        </div>
      </div>

      <p className="text-muted-foreground mt-8 text-sm">
        Looking for stable releases?{' '}
        <Link href="/download" className="text-primary hover:text-primary/80 underline underline-offset-4">
          Stable downloads
        </Link>
      </p>
    </div>
  )
}
