import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Download'
}

const platforms = [
  { title: 'macOS', description: 'Universal build for Apple Silicon and Intel Macs.' },
  { title: 'Windows', description: '64-bit installer for Windows 10+.' },
  { title: 'Linux', description: 'AppImage and .deb packages.' }
]

export default function DownloadPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight">
        Download Pilog
      </h1>
      <p className="text-muted-foreground mt-4 text-base leading-relaxed">
        Pilog is available for macOS and Windows. Linux builds are available as secondary downloads.
      </p>

      <div className="mt-10 space-y-4">
        {platforms.map((platform) => (
          <div key={platform.title} className="border-border rounded-lg border p-5">
            <h2 className="text-foreground text-base font-semibold">{platform.title}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{platform.description}</p>
            <p className="text-muted-foreground mt-3 text-sm italic">
              Download available once the first stable release is published.
            </p>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground mt-8 text-sm">
        Looking for pre-release builds?{' '}
        <Link href="/preview" className="text-primary hover:text-primary/80 underline underline-offset-4">
          Preview downloads
        </Link>
      </p>
    </div>
  )
}
