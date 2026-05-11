import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-border/60 border-t">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-6">
        <p className="text-muted-foreground text-sm">Pilog</p>
        <nav className="flex items-center gap-6">
          <Link
            href="https://github.com/nick-neely/pilog"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </Link>
          <Link
            href="/preview"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Preview builds
          </Link>
        </nav>
      </div>
    </footer>
  )
}
