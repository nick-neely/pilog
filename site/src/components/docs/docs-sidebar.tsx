'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@pilog/ui/scroll-area'

export type DocsNavItem = {
  id: string
  label: string
  children?: { id: string; label: string }[]
}

type FlatNavId = string

/**
 * Sticky docs sidebar with scroll-spy. The active item is detected by walking
 * the page's section anchors with an IntersectionObserver tuned to the top of
 * the viewport, so the highlight tracks the heading you'd be reading. The
 * 1px moss bar on the active item respects the DESIGN.md ban on
 * side-stripe borders thicker than 1px.
 */
export function DocsSidebar({ items }: { items: DocsNavItem[] }) {
  const [active, setActive] = useState<FlatNavId | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    const flatIds: FlatNavId[] = []
    for (const item of items) {
      flatIds.push(item.id)
      if (item.children) {
        for (const child of item.children) flatIds.push(child.id)
      }
    }

    const elements = flatIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)

    if (elements.length === 0) return

    // Track which sections are currently inside the spy band near the top of
    // the viewport. A Map preserves insertion order so the last entering entry
    // wins ties naturally — good enough for sequential top-to-bottom reading.
    const visible = new Map<string, number>()

    observerRef.current?.disconnect()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id
          if (entry.isIntersecting) {
            visible.set(id, entry.boundingClientRect.top)
          } else {
            visible.delete(id)
          }
        }
        if (visible.size === 0) return
        // Pick the visible heading nearest the top of the spy band.
        let bestId: string | null = null
        let bestTop = Number.POSITIVE_INFINITY
        for (const [id, top] of visible) {
          if (top < bestTop) {
            bestTop = top
            bestId = id
          }
        }
        if (bestId) setActive(bestId)
      },
      {
        // Spy band: top 0 to ~35% of the viewport. Stops the highlight from
        // jumping to a section the moment its heading enters the bottom edge.
        rootMargin: '-80px 0px -65% 0px',
        threshold: [0, 1]
      }
    )
    elements.forEach((el) => observer.observe(el))
    observerRef.current = observer

    // Seed the initial highlight from the current scroll position so the
    // sidebar isn't blank on first paint when the user lands mid-page (e.g.
    // arriving via #anchor). This is the one-shot client-only equivalent of
    // a derived-from-DOM initial value; the rule fires here but the cascade
    // it warns about can't happen because the effect runs once per `items`.
    const initial = elements.find((el) => {
      const rect = el.getBoundingClientRect()
      return rect.top >= 0 && rect.top < window.innerHeight * 0.5
    })
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initial) setActive(initial.id)
    else if (elements[0]) setActive(elements[0].id)

    return () => observer.disconnect()
  }, [items])

  return (
    <nav
      aria-label="Documentation sections"
      className="sticky top-20 hidden h-[calc(100dvh-6rem)] w-60 shrink-0 self-start lg:block"
    >
      {/* radix ScrollArea: matches the in-app sidebar's scroll surface (same
          source file via @pilog/ui/scroll-area) and inherits the warm-neutral
          thumb tokens defined in globals.css. */}
      <ScrollArea className="h-full">
        <ul className="space-y-1 pr-4">
          {items.map((item) => (
            <li key={item.id}>
              <SidebarLink id={item.id} label={item.label} active={active === item.id} />
              {item.children && item.children.length > 0 && (
                <ul className="mt-0.5 space-y-0.5">
                  {item.children.map((child) => (
                    <li key={child.id}>
                      <SidebarLink
                        id={child.id}
                        label={child.label}
                        active={active === child.id}
                        indent
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </nav>
  )
}

function SidebarLink({
  id,
  label,
  active,
  indent = false
}: {
  id: string
  label: string
  active: boolean
  indent?: boolean
}) {
  return (
    <a
      href={`#${id}`}
      aria-current={active ? 'location' : undefined}
      // 1px left rail is intentional and within the design-system limit on
      // side-stripe borders (>1px is banned; 1px reads as a quiet bookmark).
      className={[
        'group block border-l py-1.5 text-sm leading-snug transition-colors',
        indent ? 'pl-6' : 'pl-4',
        active
          ? 'border-primary text-primary font-medium'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      ].join(' ')}
    >
      {label}
    </a>
  )
}
