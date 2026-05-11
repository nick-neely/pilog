import Link from 'next/link'

const buildLine = process.env.NEXT_PUBLIC_BUILD_SHA?.slice(0, 7) ?? 'local'

/**
 * Footer — a quiet build-line in mono nods at the local-first posture
 * ("your machine, your notes"). No hero illustration, no newsletter signup,
 * no logo grid. Two links and a timestamp; that is the whole vocabulary.
 */
export function SiteFooter() {
  return (
    <footer className="border-border/60 mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-heading text-foreground text-base font-medium tracking-tight">
            Pilog
          </p>
          <p className="text-muted-foreground mt-1 max-w-[40ch] text-sm leading-relaxed">
            A local-first developer journal. Made by Nick Neely.
          </p>
        </div>
        <div className="flex flex-col items-start gap-4 md:items-end">
          <nav aria-label="Footer">
            <ul className="flex items-center gap-6">
              <li>
                <Link
                  href="https://github.com/nick-neely/pilog"
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </Link>
              </li>
              <li>
                <Link
                  href="/preview"
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  Preview builds
                </Link>
              </li>
              <li>
                <Link
                  href="/docs"
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  Docs
                </Link>
              </li>
            </ul>
          </nav>
          <p className="text-muted-foreground tabular font-mono text-xs">
            build {buildLine} · runs on your machine
          </p>
        </div>
      </div>
    </footer>
  )
}
