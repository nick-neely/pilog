import Link from 'next/link'
import Image from 'next/image'

const navItems = [
  { href: '/about', label: 'About' },
  { href: '/docs', label: 'Docs' },
  { href: '/download', label: 'Download' }
]

/**
 * Header — quiet by design. Pi-mark glyph beside the wordmark anchors the
 * brand without shouting. The mark and the wordmark together read as a
 * notebook spine; nav stays light and right-justified, no pill chrome.
 */
export function SiteHeader() {
  return (
    <header className="border-border/60 bg-background sticky top-0 z-10 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 outline-none"
          aria-label="Pilog home"
        >
          <span aria-hidden className="relative inline-flex size-9 items-center justify-center">
            <Image
              src="/pi-mark.png"
              alt=""
              width={36}
              height={36}
              className="size-9 select-none transition-transform duration-300 ease-out group-hover:-rotate-3 motion-reduce:transition-none"
              draggable={false}
              priority
            />
          </span>
          <span className="font-heading text-foreground text-[1.25rem] font-medium tracking-tight">
            Pilog
          </span>
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-7">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href="https://github.com/nick-neely/pilog"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="PiLog on GitHub"
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  )
}
