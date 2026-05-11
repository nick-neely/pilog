import Link from 'next/link'

const navItems = [
  { href: '/about', label: 'About' },
  { href: '/docs', label: 'Docs' },
  { href: '/download', label: 'Download' }
]

export function SiteHeader() {
  return (
    <header className="border-border/60 border-b">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <Link href="/" className="font-heading text-lg font-medium tracking-tight">
          Pilog
        </Link>
        <nav className="flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
