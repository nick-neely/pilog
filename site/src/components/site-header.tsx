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
          <span aria-hidden className="relative inline-flex size-7 items-center justify-center">
            <Image
              src="/pi-mark.png"
              alt=""
              width={28}
              height={28}
              className="size-7 select-none transition-transform duration-300 ease-out group-hover:-rotate-3 motion-reduce:transition-none"
              draggable={false}
              priority
            />
          </span>
          <span className="font-heading text-foreground text-[1.05rem] font-medium tracking-tight">
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
          </ul>
        </nav>
      </div>
    </header>
  )
}
