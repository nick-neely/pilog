import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@pilog/ui/button'

export const metadata: Metadata = {
  title: 'About'
}

const principles = [
  {
    num: '01',
    title: 'Capture before triage.',
    body: 'The scratchpad is a sanctuary, not a form. No chrome competes with the writing. Required fields, label pickers, and repo selectors live elsewhere or are deferred until triage. The first beat of the experience is just typing.',
    indent: 'md:pl-0'
  },
  {
    num: '02',
    title: 'Show the source, always.',
    body: 'Every generated draft is anchored visibly to its source notes and a short, user-facing reasoning summary. Confidence is named, rationale is concise, and source notes are never collapsed behind an expander by default.',
    indent: 'md:pl-[5%]'
  },
  {
    num: '03',
    title: 'Local-first is a stance, not a fallback.',
    body: 'Notes, drafts, repo metadata, and agent run history live in local SQLite. Secrets live in your OS keychain. The product makes it obvious what leaves your machine and when. The answer, by default, is nothing.',
    indent: 'md:pl-[10%]'
  },
  {
    num: '04',
    title: 'Restraint over reflex.',
    body: 'When the easy answer is "add another card," "open a modal," or "add a gradient," it is usually the wrong answer. The product earns weight through typography, rhythm, and considered surfaces. Density comes from signal, never from chrome.',
    indent: 'md:pl-[15%]'
  },
  {
    num: '05',
    title: 'Keyboard-first, mouse-welcome.',
    body: "Every triage and review action has a shortcut; the mouse is a courtesy, not the primary path. The hotkey-driven scratchpad is the product's defining gesture, and that posture propagates through every surface.",
    indent: 'md:pl-[20%]'
  }
]

const contributions = [
  {
    num: '01',
    label: 'Bug report',
    description:
      'Something broken or behaving unexpectedly? Open an issue on GitHub. The more detail the better: what you were doing, what you expected, what happened instead.'
  },
  {
    num: '02',
    label: 'Feature request',
    description:
      "Have an idea that fits the product's direction? Open a discussion or issue. Explaining the problem you're trying to solve helps more than pitching a solution."
  },
  {
    num: '03',
    label: 'Pull request',
    description:
      'Fork the repo, run pnpm install and pnpm dev to get started. For anything beyond a small fix, open an issue first so we can align on scope before you put in the work.'
  },
  {
    num: '04',
    label: 'Docs',
    description:
      'Spotted something unclear or missing in the documentation? A short PR fixing a doc is a meaningful contribution.'
  }
]

export default function AboutPage() {
  return (
    <>
      {/* Page header */}
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 md:pt-28 md:pb-20">
        <p className="text-muted-foreground mb-6 font-mono text-xs">about this project</p>
        <h1 className="font-heading text-foreground max-w-[22ch] text-[clamp(2rem,4.5vw,3.5rem)] leading-[1.08] font-normal tracking-tight">
          A journal built for the work, not the workflow.
        </h1>
        <p className="text-foreground/80 mt-6 max-w-[58ch] text-base leading-relaxed md:text-lg">
          Pilog is a quiet markdown scratchpad on a global hotkey and a local inbox that turns rough
          notes into repo-aware GitHub issue drafts. Capture fast. Draft when you have a moment.
        </p>
      </div>

      {/* Story */}
      <section aria-labelledby="story-title" className="border-border/60 border-t">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <p id="story-title" className="text-muted-foreground mb-10 font-mono text-xs">
            01 — the story
          </p>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-20">
            <div className="space-y-5 text-base leading-relaxed">
              <p className="text-foreground/90">
                The idea came from a familiar frustration. You are in the middle of something
                focused and you notice a bug, a gap, a thing worth fixing. Stopping to file a GitHub
                issue means switching context, loading a browser tab, and filling in fields when you
                just want to write one sentence. So the thought gets lost.
              </p>
              <p className="text-muted-foreground">
                Pilog&#8217;s answer is a global hotkey scratchpad. Open it, write the note in plain
                markdown, save, and the window disappears. No required fields. No repo selector. No
                form. Just the note.
              </p>
            </div>
            <div className="space-y-5 text-base leading-relaxed">
              <p className="text-muted-foreground">
                The inbox is the other half. When you have a moment, select the notes you want to
                work through and let the draft generator read them alongside your active repository.
                It groups related notes, names affected files, and writes structured issue drafts
                you can review before anything is published.
              </p>
              <p className="text-muted-foreground">
                Nothing leaves your machine until you explicitly publish a specific draft. That is
                not a setting you enable. It is how the product works by default.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section
        aria-labelledby="principles-title"
        className="bg-secondary/40 border-border/60 border-t"
      >
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-28">
          <p id="principles-title" className="text-muted-foreground mb-12 font-mono text-xs">
            02 — principles
          </p>
          <ol className="space-y-14 md:space-y-16">
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
                    <h3 className="font-heading text-foreground max-w-[22ch] text-2xl leading-tight font-normal tracking-tight md:text-[1.875rem]">
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

      {/* Contributing */}
      <section aria-labelledby="contributing-title" className="border-border/60 border-t">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-12 md:gap-16">
            <header className="md:col-span-4">
              <p className="text-muted-foreground mb-3 font-mono text-xs">03 — contributing</p>
              <h2
                id="contributing-title"
                className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight"
              >
                Open source, openly maintained.
              </h2>
              <p className="text-muted-foreground mt-4 max-w-[36ch] text-base leading-relaxed">
                Pilog lives on GitHub. The codebase, the issues, and the roadmap are all public.
                Contributions of any size are welcome.
              </p>
              <div className="mt-8">
                <Button asChild>
                  <Link
                    href="https://github.com/nick-neely/pilog"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on GitHub
                  </Link>
                </Button>
              </div>
            </header>

            <ul className="md:col-span-8">
              {contributions.map((c) => (
                <li
                  key={c.label}
                  className="border-border/60 grid grid-cols-1 gap-2 border-b border-dashed py-5 first:pt-0 last:border-b-0 md:grid-cols-12 md:gap-8"
                >
                  <div className="flex items-baseline gap-3 md:col-span-4">
                    <span
                      aria-hidden
                      className="text-muted-foreground tabular shrink-0 font-mono text-[0.7rem]"
                    >
                      {c.num}
                    </span>
                    <span className="font-heading text-foreground text-lg font-medium leading-snug">
                      {c.label}
                    </span>
                  </div>
                  <p className="text-muted-foreground pl-6 text-sm leading-relaxed md:col-span-8 md:pl-0">
                    {c.description}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Built by */}
      <section className="border-border/60 border-t">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <p className="text-muted-foreground mb-4 font-mono text-xs">04 — made by</p>
          <p className="font-heading text-foreground max-w-[30ch] text-2xl leading-snug font-normal tracking-tight md:text-3xl">
            <Link
              href="https://www.linkedin.com/in/nick-neely/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              Nick Neely
            </Link>
            , a developer who got tired of losing good notes.
          </p>
        </div>
      </section>
    </>
  )
}
