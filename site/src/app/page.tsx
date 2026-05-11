import Link from 'next/link'

const SHORTCUTS = [
  { label: 'Capture', value: 'CommandOrControl+Shift+Space' },
  { label: 'Inbox', value: 'CommandOrControl+1' },
  { label: 'Drafts', value: 'CommandOrControl+2' },
  { label: 'Generate', value: 'G D' },
  { label: 'Publish', value: 'CommandOrControl+Enter' },
  { label: 'Move', value: 'J / K' },
  { label: 'Step back', value: 'Esc' }
] as const

export default function LandingPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-20 px-6 py-20">
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

      <section className="grid gap-8 border-t border-border pt-12 md:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-foreground">Keyboard-first, mouse-welcome.</p>
          <h2 className="font-heading max-w-sm text-3xl leading-tight font-normal tracking-tight text-foreground">
            The fast path stays under your hands.
          </h2>
          <p className="max-w-[60ch] text-sm leading-relaxed text-muted-foreground">
            Open capture globally, move between Inbox and Drafts, generate issue drafts, publish,
            and clear context without leaving the keyboard.
          </p>
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.label} className="flex flex-col gap-1 border-b border-border pb-4">
              <dt className="text-sm text-muted-foreground">{shortcut.label}</dt>
              <dd className="font-mono text-sm text-foreground">{shortcut.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
