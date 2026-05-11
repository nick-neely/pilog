import { Kbd, KbdGroup } from '@pilog/ui/kbd'
import { Badge } from '@pilog/ui/badge'
import type { SiteModKeyGlyph } from '@/lib/platform'

/**
 * Bento — four cells, deliberately varied sizes; not an identical-card grid.
 * Surfaces use tonal contrast on the warm-neutral ramp (popover, secondary,
 * muted) — never a shadow, never a colored side stripe. The moss accent is
 * permitted only inside the Capture cell, since "Capture is the gesture" is
 * the primary affordance.
 */
export function Bento({ modKey }: { modKey: SiteModKeyGlyph }) {
  return (
    <section aria-labelledby="bento-title" className="bg-secondary/30 border-border/60 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <header className="mb-12 max-w-3xl">
          <p className="text-muted-foreground mb-3 font-mono text-xs">03 — what&#8217;s inside</p>
          <h2
            id="bento-title"
            className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight md:text-4xl"
          >
            A capture surface, a triage surface, and almost nothing else.
          </h2>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:grid-rows-[auto_auto] md:gap-5">
          {/* Capture — big top-left */}
          <article className="border-border bg-popover relative overflow-hidden rounded-2xl border p-7 md:col-span-8 md:row-span-1 md:p-9">
            <div className="mb-6 flex items-center gap-3">
              <span className="text-muted-foreground font-mono text-xs">01</span>
              <h3 className="font-heading text-foreground text-2xl font-medium tracking-tight">
                Capture is the gesture
              </h3>
            </div>
            <p className="text-muted-foreground mb-8 max-w-[52ch] text-base leading-relaxed">
              A global hotkey opens a markdown scratchpad with no chrome competing with what
              you&#8217;re writing. The window is waiting for you, not demanding attention. Hit
              <span className="mx-1 inline-flex translate-y-[2px] items-center">
                <KbdGroup>
                  <Kbd>{modKey}</Kbd>
                  <Kbd>S</Kbd>
                </KbdGroup>
              </span>
              to save, anywhere is gone before you finish moving your hand.
            </p>

            {/* Faux scratchpad — Plex Mono body, no chrome around it. Tonal
                contrast (Ash over Parchment-Light) instead of a nested card. */}
            <div aria-hidden className="bg-secondary/50 rounded-xl p-5">
              <div className="text-muted-foreground mb-3 flex items-center justify-between font-mono text-[0.7rem]">
                <span>scratchpad</span>
                <KbdGroup>
                  <Kbd>{modKey}</Kbd>
                  <Kbd>⇧</Kbd>
                  <Kbd>Space</Kbd>
                </KbdGroup>
              </div>
              <pre className="text-foreground/90 font-mono text-[0.85rem] leading-[1.65] whitespace-pre-wrap">
                {`save btn → no loading state
ghost click on offline submit
queue dedup by payload hash?

# inbox row spacing
12px where scale wants 16px
same root as <SettingsRow/>`}
                <span className="bg-primary ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] animate-pulse motion-reduce:animate-none" />
              </pre>
            </div>
          </article>

          {/* Drafts — tall right */}
          <article className="border-border bg-popover relative flex flex-col overflow-hidden rounded-2xl border p-7 md:col-span-4 md:row-span-2 md:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="text-muted-foreground font-mono text-xs">02</span>
              <h3 className="font-heading text-foreground text-2xl font-medium tracking-tight">
                Drafts you can audit
              </h3>
            </div>
            <p className="text-muted-foreground mb-8 text-base leading-relaxed">
              Every issue draft is anchored visibly to its source notes and a short reasoning
              summary. Confidence is named. Nothing is hidden behind an expander.
            </p>

            <div className="space-y-4">
              <FauxDraft
                title="Save button needs a loading state"
                confidence="high"
                files={['src/ui/save-button.tsx']}
                source="from notes at 09:42, 14:55"
              />
              <FauxDraft
                title="Settings & inbox spacing regression"
                confidence="medium"
                files={['src/components/settings-row.tsx']}
                source="from notes at 10:24, 13:02"
              />
            </div>

            <div className="text-muted-foreground mt-auto pt-6 font-mono text-xs">
              <span className="text-foreground">Nothing leaves your machine</span> until you press
              publish on a specific draft.
            </div>
          </article>

          {/* Local-first */}
          <article className="border-border bg-popover relative overflow-hidden rounded-2xl border p-7 md:col-span-4">
            <div className="mb-5 flex items-center gap-3">
              <span className="text-muted-foreground font-mono text-xs">03</span>
              <h3 className="font-heading text-foreground text-xl font-medium tracking-tight">
                Local-first by default
              </h3>
            </div>
            <p className="text-muted-foreground mb-5 text-sm leading-relaxed">
              Notes, drafts, agent run history live in local SQLite. Secrets live in your OS
              keychain. There is no Pilog server.
            </p>
            <ul className="text-foreground/80 space-y-1 font-mono text-[0.78rem]">
              <li>~/.pilog/journal.sqlite</li>
              <li>os-keychain://pilog.gh.token</li>
              <li>provider keys → byok via pi</li>
            </ul>
          </article>

          {/* Repo-aware */}
          <article className="border-border bg-popover relative overflow-hidden rounded-2xl border p-7 md:col-span-4">
            <div className="mb-5 flex items-center gap-3">
              <span className="text-muted-foreground font-mono text-xs">04</span>
              <h3 className="font-heading text-foreground text-xl font-medium tracking-tight">
                Repo-aware drafts
              </h3>
            </div>
            <p className="text-muted-foreground mb-5 text-sm leading-relaxed">
              The agent reads the active repository alongside your notes — affected files, labels,
              owners, prior issues — and proposes drafts that actually fit.
            </p>
            <pre className="bg-secondary/50 text-foreground/90 overflow-x-auto rounded-md p-3 font-mono text-[0.75rem] leading-[1.6]">
              {`repo: nick-neely/pilog
labels: bug, ux-polish
codeowners: @nick-neely
prior: #142 (similar)`}
            </pre>
          </article>
        </div>
      </div>
    </section>
  )
}

function FauxDraft({
  title,
  confidence,
  files,
  source
}: {
  title: string
  confidence: 'low' | 'medium' | 'high'
  files: string[]
  source: string
}) {
  return (
    <div className="border-border/70 border-t border-dashed pt-4 first:border-t-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono">
          draft
        </Badge>
        <span className="text-muted-foreground font-mono text-[0.7rem]">
          confidence: {confidence}
        </span>
      </div>
      <h4 className="font-heading text-foreground text-base leading-snug font-medium">{title}</h4>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {files.map((f) => (
          <li
            key={f}
            className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[0.7rem]"
          >
            {f}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground mt-2 font-mono text-[0.7rem]">{source}</p>
    </div>
  )
}
