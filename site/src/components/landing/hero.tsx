import Link from 'next/link'
import { Button } from '@pilog/ui/button'
import { Kbd, KbdGroup } from '@pilog/ui/kbd'
import { PiMark } from '@/components/pi-mark'
import type { SiteModKeyGlyph } from '@/lib/platform'

/**
 * Hero — asymmetric 7/5 split. Left column carries an oversized Source Serif 4
 * line and the two CTAs; right column carries the Pi mark at hero scale,
 * rotated 2.5° and lifted with the lone documented hover shadow. The mark IS
 * the imagery; no stock photos, no SaaS-cliché abstract gradient. The mod⇧Space
 * Kbd cluster is a quiet tease of the product's defining gesture (mod is ⌘ or Ctrl by UA).
 */
export function Hero({ modKey }: { modKey: SiteModKeyGlyph }) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 pt-20 pb-24 md:grid-cols-12 md:gap-8 md:pt-28 md:pb-32"
    >
      <div className="md:col-span-7 md:pt-6">
        <p className="text-muted-foreground mb-6 inline-flex items-center gap-2 font-mono text-xs">
          <span aria-hidden className="bg-primary inline-block size-1.5 rounded-full" />a
          local-first developer journal
        </p>
        <h1
          id="hero-title"
          className="font-heading text-foreground text-[clamp(2.5rem,6vw,4.75rem)] leading-[1.04] font-normal tracking-tight"
        >
          Capture before
          <br />
          you forget.
          <br />
          <span className="text-muted-foreground">Triage when you&#8217;re ready.</span>
        </h1>
        <p className="text-foreground/80 mt-8 max-w-[58ch] text-base leading-relaxed md:text-lg">
          Pilog is a quiet markdown scratchpad on a global hotkey and an inbox that turns the pile
          of rough notes into repo-aware GitHub issue drafts. You write what you noticed in flow;
          Pilog drafts the issues when you have a moment.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/download">Download Pilog</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/docs">Read the docs</Link>
          </Button>
          <span
            className="text-muted-foreground ml-1 hidden items-center gap-2 font-mono text-xs sm:inline-flex"
            aria-label={
              modKey === '⌘'
                ? 'The global capture shortcut is Command Shift Space'
                : 'The global capture shortcut is Control Shift Space'
            }
          >
            or press
            <KbdGroup>
              <Kbd>{modKey}</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>Space</Kbd>
            </KbdGroup>
            anywhere
          </span>
        </div>
      </div>

      <div className="relative md:col-span-5 md:pt-2">
        <div className="relative mx-auto w-full max-w-[440px]">
          {/* Page-corner curl shadow — the ONE documented hero-only lift. */}
          <div
            aria-hidden
            className="bg-secondary/60 ring-border absolute -inset-3 -rotate-[3deg] rounded-[2rem] ring-1"
          />
          <div className="bg-popover ring-border relative rotate-[2.5deg] rounded-[1.75rem] p-4 shadow-xl ring-1 transition-transform duration-700 ease-out hover:rotate-[1.5deg] motion-reduce:transition-none">
            <PiMark variant="icon" priority className="block h-auto w-full rounded-[1.25rem]" />
          </div>
          <div className="text-muted-foreground absolute -bottom-2 right-2 font-mono text-[0.7rem] tracking-tight">
            pilog.app — a desk-side journal
          </div>
        </div>
      </div>
    </section>
  )
}
