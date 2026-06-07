import Link from 'next/link'
import { Button } from '@pilog/ui/button'
import { PiMark } from '@/components/pi-mark'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  )
}

/**
 * Hero — asymmetric 7/5 split. Left column carries an oversized Source Serif 4
 * line and the two CTAs; right column carries the Pi mark at hero scale,
 * rotated 2.5° and lifted with the lone documented hover shadow. The mark IS
 * the imagery; no stock photos, no SaaS-cliché abstract gradient.
 */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 pt-20 pb-24 md:grid-cols-12 md:gap-8 md:pt-28 md:pb-32"
    >
      <div className="md:col-span-7 md:pt-6">
        <p className="text-muted-foreground mb-6 inline-flex items-center gap-2 font-mono text-xs">
          <span aria-hidden className="bg-primary inline-block size-1.5 rounded-full" />
          free and open-source · local-first developer journal
        </p>
        <h1
          id="hero-title"
          className="font-heading text-foreground text-[clamp(2.45rem,5.9vw,4.7rem)] leading-[1.05] font-normal tracking-[-0.013em] [font-feature-settings:'kern'_1,'liga'_1]"
        >
          <span className="block">Capture before</span>
          <span className="mt-[0.08em] block">you forget.</span>
          <span className="text-muted-foreground mt-[0.08em] block text-[0.6em] tracking-[0.028em] [font-variant-numeric:proportional-nums]">
            Triage when you&#8217;re ready.
          </span>
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
        </div>
        <a
          href="https://github.com/nick-neely/pilog"
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-1.5 font-mono text-xs transition-colors"
        >
          <GitHubIcon className="size-3.5" />
          MIT licensed. View source.
        </a>
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
        </div>
      </div>

      <div
        aria-hidden
        className="text-muted-foreground/50 absolute bottom-6 left-1/2 -translate-x-1/2 motion-safe:animate-bounce"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3.5 7l5.5 5.5L14.5 7" />
        </svg>
      </div>
    </section>
  )
}
