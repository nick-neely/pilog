import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About'
}

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight">
        About Pilog
      </h1>
      <div className="text-foreground mt-8 space-y-5 text-base leading-relaxed">
        <p>
          Pilog separates <strong>capture</strong> from <strong>triage</strong>. The scratchpad is
          the lightest possible markdown surface, opened by a global hotkey, designed to disappear
          from your attention as soon as the note is written.
        </p>
        <p>
          The inbox accumulates raw notes. On demand, a local AI-driven agent reads them alongside
          the active repository and produces grouped, repo-aware GitHub issue drafts with titles,
          bodies, suggested labels, acceptance criteria, affected files, confidence scores, and
          concise rationale.
        </p>
        <p>
          Pilog is local-first by default. Notes, drafts, repo metadata, and agent run history live
          in local SQLite. Secrets live in OS credential storage. Nothing leaves your machine unless
          you publish.
        </p>
      </div>
    </div>
  )
}
