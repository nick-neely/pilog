type Principle = {
  num: string
  title: string
  body: string
  indent: string
}

const principles: Principle[] = [
  {
    num: '01',
    title: 'Capture before triage.',
    body: 'The scratchpad is a sanctuary, not a form. No chrome competes with the writing. Required fields, label pickers, and repo selectors live elsewhere or are deferred until triage. The first beat of the experience is just typing.',
    indent: 'md:pl-0'
  },
  {
    num: '02',
    title: 'Show the source, always.',
    body: 'Every generated draft is anchored visibly to its source notes and a short, user-facing reasoning summary. Confidence is named, rationale is concise, and the raw notes are never hidden behind an expander by default.',
    indent: 'md:pl-[8%]'
  },
  {
    num: '03',
    title: 'Local-first is a stance, not a fallback.',
    body: 'Notes, drafts, repo metadata, and agent run history live in local SQLite. Secrets live in OS credential storage. Draft generation only stays on your machine when Pi uses a local model (Ollama, LM Studio, and the like); cloud APIs see what you send on Generate. The product makes both boundaries obvious.',
    indent: 'md:pl-[16%]'
  }
]

/**
 * Principles — typographic block, not a card grid. Numbered serif headlines
 * with body underneath, increasing left-indent down the page to break the
 * grid feel. Asymmetric on purpose. Matches PRODUCT.md's design principles
 * 1–3; the remaining two principles read more product-internal and stay in
 * the doc.
 */
export function Principles() {
  return (
    <section
      aria-labelledby="principles-title"
      className="bg-secondary/40 border-border/60 border-t"
    >
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-32">
        <p id="principles-title" className="text-muted-foreground mb-12 font-mono text-xs">
          05 — the stance
        </p>
        <ol className="space-y-16 md:space-y-20">
          {principles.map((p) => (
            <li key={p.num} className={p.indent}>
              <div className="grid grid-cols-12 gap-4">
                <span
                  aria-hidden
                  className="text-muted-foreground tabular col-span-2 font-mono text-sm md:col-span-1 md:text-base"
                >
                  {p.num}
                </span>
                <div className="col-span-10 md:col-span-11">
                  <h3 className="font-heading text-foreground max-w-[22ch] text-2xl leading-tight font-normal tracking-tight md:text-[2rem]">
                    {p.title}
                  </h3>
                  <p className="text-muted-foreground mt-4 max-w-[60ch] text-base leading-relaxed">
                    {p.body}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
