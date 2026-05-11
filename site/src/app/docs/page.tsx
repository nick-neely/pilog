import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Docs'
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight">
        Documentation
      </h1>
      <p className="text-muted-foreground mt-4 text-base leading-relaxed">
        Pilog documentation is coming soon. In the meantime, see the{' '}
        <a
          href="https://github.com/nick-neely/pilog"
          className="text-primary hover:text-primary/80 underline underline-offset-4"
          target="_blank"
          rel="noopener noreferrer"
        >
          README on GitHub
        </a>{' '}
        for setup and usage.
      </p>
    </div>
  )
}
