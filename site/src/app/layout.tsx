import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Pilog — Capture before you forget, triage when you’re ready',
    template: '%s — Pilog'
  },
  description:
    'A local-first developer journal for turning rough notes into GitHub-ready issues. Capture in flow, triage at your pace.',
  metadataBase: new URL('https://pilog.dev')
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col antialiased" suppressHydrationWarning>
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  )
}
