import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <section className="flex flex-col items-start gap-6">
        <h1 className="font-heading text-foreground max-w-2xl text-4xl leading-tight font-normal tracking-tight">
          Capture before you forget.
          <br />
          Triage when you&#8217;re ready.
        </h1>
        <p className="text-muted-foreground max-w-xl text-base leading-relaxed">
          Pilog is a local-first developer journal that turns rough notes into repo-aware GitHub
          issues. Jot down what you notice in flow, then let Pilog draft the issues when you have a
          moment.
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Link
            href="/download"
            className="bg-primary text-primary-foreground hover:bg-primary/80 focus-visible:ring-ring/30 focus-visible:border-ring inline-flex h-9 items-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none active:translate-y-px"
          >
            Download
          </Link>
          <Link
            href="/docs"
            className="border-border bg-background text-foreground hover:bg-secondary focus-visible:ring-ring/30 focus-visible:border-ring inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none active:translate-y-px"
          >
            Read the docs
          </Link>
        </div>
      </section>
    </div>
  )
}
