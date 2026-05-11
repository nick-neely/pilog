import { Badge } from '@pilog/ui/badge'

const rawNotes = [
  { time: '09:42', body: 'save btn → no loading state; ghost click bug' },
  { time: '10:11', body: 'auth redirect broken on /settings — middleware?' },
  { time: '10:24', body: 'mobile spacing off in <SettingsRow> 12px not 16' },
  { time: '13:02', body: 'mobile spacing also in <Inbox/>, same root?' },
  { time: '14:55', body: '“save” triggers twice when offline, dedup queue' }
]

type Draft = {
  title: string
  affected: string[]
  confidence: 'low' | 'medium' | 'high'
  sources: number
  body: string
}

const drafts: Draft[] = [
  {
    title: 'Save button is missing a loading state and double-fires offline',
    affected: ['src/ui/save-button.tsx', 'src/lib/queue.ts'],
    confidence: 'high',
    sources: 2,
    body: 'Two notes from 09:42 and 14:55 describe the same async-write race. Suggested: pessimistic spinner + queue-side dedup keyed on payload hash.'
  },
  {
    title: 'Spacing scale regression in settings + inbox rows',
    affected: ['src/components/settings-row.tsx', 'src/components/inbox/row.tsx'],
    confidence: 'medium',
    sources: 2,
    body: 'Two notes flag a 12px gap where the scale expects 16px. Likely a shared token misuse, not two bugs.'
  }
]

/**
 * Transformation — the product's defining move, shown once. Raw notes on the
 * left (mono, timestamps, prose-y), a thin vertical rule + arrow, and the
 * structured drafts on the right with confidence + source-note attribution
 * always visible (never collapsed by default — PRODUCT.md commits the system
 * to this). No animation; the editorial spread shape carries it.
 */
export function Transformation() {
  return (
    <section aria-labelledby="transformation-title" className="border-border/60 border-t">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-10">
          <header className="md:col-span-12 md:mb-2">
            <p className="text-muted-foreground mb-3 font-mono text-xs">02 — the move</p>
            <h2
              id="transformation-title"
              className="font-heading text-foreground max-w-[24ch] text-3xl leading-tight font-normal tracking-tight md:text-4xl"
            >
              Five rough notes become two drafts you can publish.
            </h2>
          </header>

          <div className="md:col-span-5">
            <p className="text-muted-foreground mb-4 font-mono text-xs">what you typed</p>
            <ol className="space-y-3">
              {rawNotes.map((n) => (
                <li
                  key={n.time}
                  className="border-border bg-popover/40 flex items-start gap-3 border-l border-dashed py-1.5 pl-4"
                >
                  <span className="text-muted-foreground tabular shrink-0 font-mono text-[0.78rem]">
                    {n.time}
                  </span>
                  <span className="text-foreground/90 font-mono text-[0.85rem] leading-relaxed">
                    {n.body}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div
            aria-hidden
            className="text-muted-foreground hidden flex-col items-center justify-center gap-3 md:col-span-1 md:flex"
          >
            <div className="bg-border h-12 w-px" />
            <span className="font-heading text-2xl leading-none">→</span>
            <div className="bg-border h-12 w-px" />
          </div>

          <div className="md:col-span-6">
            <p className="text-muted-foreground mb-4 font-mono text-xs">what Pilog drafts</p>
            <div className="space-y-5">
              {drafts.map((d) => (
                <article key={d.title} className="border-border bg-popover rounded-xl border p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      issue draft
                    </Badge>
                    <span className="text-muted-foreground font-mono text-[0.7rem]">
                      confidence: {d.confidence} · {d.sources} source notes
                    </span>
                  </div>
                  <h3 className="font-heading text-foreground text-lg leading-snug font-medium">
                    {d.title}
                  </h3>
                  <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{d.body}</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {d.affected.map((f) => (
                      <li
                        key={f}
                        className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 font-mono text-[0.72rem]"
                      >
                        {f}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
