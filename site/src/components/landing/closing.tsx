import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@pilog/ui/button'
import { Kbd, KbdGroup } from '@pilog/ui/kbd'

/**
 * Closing — a single Source Serif 4 line at hero scale, with a faint Pi-mark
 * watermark sitting behind it. One primary button, one quiet kbd hint. No
 * second accent, no marquee, no horizon-line illustration. The page resolves
 * the way the product resolves: a written-down thought, then a clean exit.
 */
export function Closing() {
  return (
    <section
      aria-labelledby="closing-title"
      className="border-border/60 relative overflow-hidden border-t"
    >
      {/* Pi watermark — restraint earns the motif its weight. Single, large,
          faint, behind type; never repeated in a row across the page. */}
      <Image
        src="/pi-mark.png"
        alt=""
        aria-hidden
        width={520}
        height={520}
        className="pointer-events-none absolute -bottom-24 -right-16 hidden h-[520px] w-[520px] select-none opacity-[0.07] md:block"
        draggable={false}
      />
      <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-36">
        <p className="text-muted-foreground mb-6 font-mono text-xs">06 — close the loop</p>
        <h2
          id="closing-title"
          className="font-heading text-foreground max-w-[18ch] text-[clamp(2.25rem,5vw,4rem)] leading-[1.05] font-normal tracking-tight"
        >
          A bedside journal
          <br />
          for your repo.
        </h2>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link href="/download">Download Pilog</Link>
          </Button>
          <Link
            href="https://github.com/nick-neely/pilog"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            See it on GitHub →
          </Link>
          <span
            className="text-muted-foreground ml-auto hidden items-center gap-2 font-mono text-xs md:inline-flex"
          >
            installed?
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>Space</Kbd>
            </KbdGroup>
          </span>
        </div>
      </div>
    </section>
  )
}
