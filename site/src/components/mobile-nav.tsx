'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@pilog/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@pilog/ui/sheet'
import { cn } from '@pilog/ui/utils'

export type SiteNavItem = {
  href: string
  label: string
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 fill-current">
      <path d="M4 6h16v1.5H4V6zm0 5.25h16v1.5H4v-1.5zm0 5.25h16V18H4v-1.5z" />
    </svg>
  )
}

/**
 * Mobile site navigation — a left Sheet keeps the header quiet while restoring
 * access to About, Docs, and Download below the md breakpoint.
 */
export function MobileNav({ items }: { items: SiteNavItem[] }) {
  const pathname = usePathname()

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Open site menu"
          className="text-muted-foreground hover:text-foreground"
        >
          <MenuIcon />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100vw-2rem,18rem)] gap-0 p-0">
        <SheetHeader className="border-border/60 border-b px-6 py-5">
          <SheetTitle className="font-heading text-lg font-medium tracking-tight">Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile">
          <ul className="flex flex-col gap-1 px-3 py-4">
            {items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(`${item.href}/`))

              return (
                <li key={item.href}>
                  <SheetClose asChild>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-11 items-center rounded-md px-3 text-base font-medium transition-colors',
                        active
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {item.label}
                    </Link>
                  </SheetClose>
                </li>
              )
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
