import { DocsCodeBlock, DocsCommand } from '@/components/docs/docs-copyable'
import { DocsDownloadCard } from '@/components/docs/docs-download-card'
import { DocsSidebar, type DocsNavItem } from '@/components/docs/docs-sidebar'
import rawManifest from '@/data/release-manifest.json'
import { docsMetadata, docsStructuredData, JsonLdScript } from '@/lib/metadata'
import { modKeyLabel, type SiteModKeyGlyph } from '@/lib/platform'
import type { ReleaseManifest } from '@/lib/release-manifest'
import { getServerDetectedPlatform } from '@/lib/server-detected-platform'
import { Kbd, KbdGroup } from '@pilog/ui/kbd'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = docsMetadata

const manifest = rawManifest as ReleaseManifest
// Prefer stable; fall back to preview so the install card is always useful.
const channel = manifest.stable ?? manifest.preview

const nav: DocsNavItem[] = [
  {
    id: 'getting-started',
    label: 'Getting started',
    children: [
      { id: 'download', label: 'Download & install' },
      { id: 'first-launch', label: 'First launch' },
      { id: 'connect-github', label: 'Connect GitHub' },
      { id: 'configure-pi', label: 'Configure Pi' },
      { id: 'first-note', label: 'Your first note' },
      { id: 'generate-drafts', label: 'Generate drafts' }
    ]
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts'
  },
  {
    id: 'pi-deeper',
    label: 'Pi, in depth',
    children: [
      { id: 'providers', label: 'Model catalog' },
      { id: 'local-models', label: 'Local models (Ollama)' },
      { id: 'api-keys', label: 'Getting an API key' },
      { id: 'switch-model', label: 'Switching models' }
    ]
  },
  {
    id: 'review-publish',
    label: 'Review & publish'
  },
  {
    id: 'privacy',
    label: 'Privacy & local-first'
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting'
  }
]

type Shortcut = { keys: string[]; verb: string; group: string }

const shortcuts: Shortcut[] = [
  { group: 'Global', keys: ['MOD', '⇧', 'Space'], verb: 'Open the scratchpad anywhere' },
  { group: 'Global', keys: ['MOD', '1'], verb: 'Open Inbox' },
  { group: 'Global', keys: ['MOD', '2'], verb: 'Open Drafts' },
  { group: 'Global', keys: ['MOD', 'K'], verb: 'Open command palette' },
  { group: 'Inbox & Drafts', keys: ['J'], verb: 'Move to next item' },
  { group: 'Inbox & Drafts', keys: ['K'], verb: 'Move to previous item' },
  { group: 'Inbox & Drafts', keys: ['G', 'D'], verb: 'Generate drafts from selection' },
  { group: 'Inbox & Drafts', keys: ['MOD', '↵'], verb: 'Publish the draft you’re reading' },
  { group: 'Inbox & Drafts', keys: ['Esc'], verb: 'Step back, clear selection, or close' },
  { group: 'Editor', keys: ['MOD', 'S'], verb: 'Save the current note or draft' }
]

function keyChip(token: string, modKey: SiteModKeyGlyph): string {
  return token === 'MOD' ? modKey : token
}

function groupShortcuts(items: Shortcut[]) {
  const out = new Map<string, Shortcut[]>()
  for (const s of items) {
    const list = out.get(s.group)
    if (list) list.push(s)
    else out.set(s.group, [s])
  }
  return [...out.entries()]
}

export default async function DocsPage() {
  const platform = await getServerDetectedPlatform()
  const modKey = modKeyLabel(platform)

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-16 md:py-20">
      <JsonLdScript data={docsStructuredData} />
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-16">
        <DocsSidebar items={nav} />

        <article className="min-w-0">
          {/* ───── Header ─────────────────────────────────────────────── */}
          <header>
            <p className="text-muted-foreground mb-3 font-mono text-xs">documentation</p>
            <h1 className="font-heading text-foreground text-4xl leading-[1.05] font-normal tracking-tight md:text-5xl">
              Getting started
            </h1>
            <p className="text-foreground/85 mt-5 max-w-[64ch] text-base leading-relaxed md:text-lg">
              Pilog is a global-hotkey scratchpad and a local inbox that turns rough notes into
              repo-aware GitHub issue drafts. This guide installs the app, connects it to GitHub and
              the Pi draft agent, and walks you through the loop from capture to publish.
            </p>
          </header>

          {/* ───── Download & install ─────────────────────────────────── */}
          <Section id="download" eyebrow="Step 01" title="Download & install" topSpacing>
            {channel ? (
              <>
                <DocsDownloadCard channel={channel} />
                {manifest.stable === null && (
                  <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                    The first stable release hasn&apos;t shipped yet, so the card above offers the
                    current <span className="font-medium">preview</span> build. Preview builds are
                    feature-complete but unsigned, so your OS will show a security warning on first
                    launch. See{' '}
                    <Link
                      href="/preview"
                      className="text-primary hover:text-primary/80 underline underline-offset-4"
                    >
                      all preview downloads
                    </Link>{' '}
                    for older versions.
                  </p>
                )}
              </>
            ) : (
              <div className="border-border bg-popover rounded-xl border p-6">
                <p className="text-foreground font-heading text-xl font-normal tracking-tight">
                  No builds published yet.
                </p>
                <p className="text-muted-foreground mt-2 max-w-[52ch] text-sm leading-relaxed">
                  Once the first preview or stable build is published you&apos;ll find installers
                  here. In the meantime, you can build from source. See the{' '}
                  <Link
                    href="https://github.com/nick-neely/pilog#setup"
                    className="text-primary hover:text-primary/80 underline underline-offset-4"
                  >
                    README
                  </Link>{' '}
                  for instructions.
                </p>
              </div>
            )}

            <Aside title="System requirements">
              <ul className="space-y-1.5">
                <li>
                  <span className="text-foreground font-medium">macOS</span> 12 Monterey or later;
                  Apple Silicon or Intel. Allow Pilog to use Keychain when prompted.
                </li>
                <li>
                  <span className="text-foreground font-medium">Windows</span> 10 or later. Git for
                  Windows must be installed and on your <span className="font-mono">PATH</span>{' '}
                  before linking a repository.
                </li>
                <li>
                  <span className="text-foreground font-medium">Linux</span> needs{' '}
                  <span className="font-mono">git</span> from your distribution and a desktop
                  keyring (GNOME Keyring or KWallet via <span className="font-mono">libsecret</span>
                  ) for credential storage. Headless sessions, minimal containers, and some WSL2
                  setups do not expose a keyring.
                </li>
              </ul>
            </Aside>
          </Section>

          {/* ───── First launch ───────────────────────────────────────── */}
          <Section id="first-launch" eyebrow="Step 02" title="First launch">
            <p>
              The first time you open Pilog it walks through a short onboarding: confirm the global
              hotkey, sign in to GitHub, link a local repository, configure the Pi draft agent,
              capture a note, and generate your first draft. You can skip onboarding and return to
              any step from Settings.
            </p>
            <ol className="text-foreground/90 mt-5 space-y-3 text-base leading-relaxed">
              <Step n="01">
                Confirm or rebind the global capture hotkey. Default is{' '}
                <InlineKeys modKey={modKey} tokens={['MOD', '⇧', 'Space']} />. The hotkey is
                registered against your OS, so it works whether or not Pilog has window focus.
              </Step>
              <Step n="02">Connect GitHub (next step).</Step>
              <Step n="03">
                Link one local repository (the folder on disk you intend to file issues against).
              </Step>
              <Step n="04">Configure the Pi provider and model (further down this page).</Step>
              <Step n="05">
                Capture a quick note with the hotkey to confirm the loop works end-to-end.
              </Step>
            </ol>
          </Section>

          {/* ───── Connect GitHub ─────────────────────────────────────── */}
          <Section id="connect-github" eyebrow="Step 03" title="Connect GitHub">
            <p>
              Pilog signs into GitHub using the{' '}
              <Link
                href="https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline underline-offset-4"
              >
                Device Flow
              </Link>
              . When you click <em>Sign in</em>, Pilog opens GitHub in your browser, you authorize
              the app, and the access token is stored in OS-backed credential storage (Keychain on
              macOS, DPAPI on Windows, the keyring on Linux). No personal access token is required.
            </p>
            <p>
              The OAuth scope is the minimum needed to read repository metadata and create issues on
              your behalf. Sign out from Settings → Account at any time; the token is wiped from
              keychain immediately.
            </p>
          </Section>

          {/* ───── Configure Pi ───────────────────────────────────────── */}
          <Section id="configure-pi" eyebrow="Step 04" title="Configure Pi">
            <p>
              <span className="text-foreground font-medium">Pi</span> is the local agent harness
              that reads your selected notes alongside the active repository and produces structured
              issue drafts. Pilog bundles the Pi runtime; you choose the provider and model. A cloud
              API is the default path; for inference that never leaves your machine, use a local
              model via{' '}
              <Link
                href="#local-models"
                className="text-primary hover:text-primary/80 underline underline-offset-4"
              >
                Ollama
              </Link>{' '}
              (recommended) or another OpenAI-compatible local server.
            </p>

            <Callout>
              <strong className="text-foreground font-medium">Recommended:</strong>{' '}
              <span className="text-foreground">Anthropic</span> as the provider and{' '}
              <span className="text-foreground font-mono">claude-sonnet-4-6</span> as the model.
              Sonnet 4.6 reasons well over rough developer prose, follows the issue-draft schema
              reliably, and stays inside the latency budget for an interactive review session.
            </Callout>

            <p className="mt-5">In Pilog, open Settings → Provider &amp; Model and:</p>
            <ol className="text-foreground/90 mt-3 space-y-3 text-base leading-relaxed">
              <Step n="01">
                Pick <span className="text-foreground font-medium">Anthropic</span> from the
                provider dropdown.
              </Step>
              <Step n="02">
                Pick <span className="text-foreground font-mono">claude-sonnet-4-6</span> from the
                model dropdown.
              </Step>
              <Step n="03">
                Paste your Anthropic API key. Get one at{' '}
                <Link
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  console.anthropic.com/settings/keys
                </Link>{' '}
                . Create a workspace if you don&apos;t have one, then <em>Create Key</em>. Keys
                start with <span className="font-mono">sk-ant-…</span>.
              </Step>
              <Step n="04">
                Click <span className="text-foreground font-medium">Configure Pi</span>. The key is
                stored in OS-backed safe storage, separate from Pilog&apos;s SQLite database.
              </Step>
            </ol>

            <p className="mt-5">
              Already use the <span className="font-mono">pi</span> CLI on this machine? Click{' '}
              <span className="text-foreground font-medium">Import existing Pi config</span> on the
              setup panel and Pilog will pick up provider credentials from{' '}
              <span className="font-mono">~/.pi/agent/auth.json</span> without you re-entering
              anything.
            </p>
          </Section>

          {/* ───── First note ─────────────────────────────────────────── */}
          <Section id="first-note" eyebrow="Step 05" title="Your first note">
            <p>
              Press <InlineKeys modKey={modKey} tokens={['MOD', '⇧', 'Space']} /> from anywhere. A
              quiet markdown scratchpad opens; type the thought as it occurs to you. No fields, no
              repo selector, no priority picker. Save with{' '}
              <InlineKeys modKey={modKey} tokens={['MOD', 'S']} /> or simply close the window. The
              note lands in your inbox.
            </p>
            <p>
              Notes are plain markdown. Links, code fences, lists, and inline backticks all render
              in the draft generator&apos;s context. You can edit, retitle, or delete a note from
              the inbox at any time.
            </p>
          </Section>

          {/* ───── Generate drafts ────────────────────────────────────── */}
          <Section id="generate-drafts" eyebrow="Step 06" title="Generate drafts">
            <p>
              Open the inbox (<InlineKeys modKey={modKey} tokens={['MOD', '1']} />
              ), select one or more notes belonging to the same linked repo, and press{' '}
              <InlineKeys tokens={['G', 'D']} />, or click{' '}
              <span className="text-foreground font-medium">Generate Drafts</span>. Pi reads the
              notes alongside repository metadata, groups related ideas, and writes structured issue
              drafts with titles, bodies, suggested labels, affected files, and a confidence signal.
            </p>
            <p>
              Every draft is visibly anchored to the notes that produced it. The reasoning summary
              is short by design; the raw source notes are never hidden behind an expander by
              default. If the agent grouped two notes you wanted to keep separate, you can split a
              draft and regenerate just that subset.
            </p>
            <Aside title="What gets sent">
              When you generate drafts, Pilog sends the <em>selected notes</em> and a bounded slice
              of repository context (file tree, README excerpts, language signals) to your
              configured Pi provider (your machine with Ollama or similar, otherwise the
              vendor&apos;s API). Drafts and the full run transcript are saved locally. Nothing is
              sent until you click Generate.
            </Aside>
          </Section>

          {/* ───── Shortcuts ──────────────────────────────────────────── */}
          <Section id="shortcuts" title="Shortcuts" topSpacing>
            <p>
              Pilog is keyboard-first. Every triage and review action has a shortcut; the mouse is a
              courtesy. The few you&apos;ll learn first:
            </p>
            <div className="mt-6 space-y-8">
              {groupShortcuts(shortcuts).map(([group, items]) => (
                <div key={group}>
                  <h3 className="text-foreground font-mono text-xs tracking-[0.12em] uppercase">
                    {group}
                  </h3>
                  <ul className="mt-3 divide-y divide-dashed divide-border/60">
                    {items.map((s) => (
                      <li key={s.verb} className="flex items-center gap-5 py-2.5">
                        <KbdGroup className="shrink-0">
                          {s.keys.map((k, i) => (
                            <Kbd key={`${s.verb}-${i}-${k}`}>{keyChip(k, modKey)}</Kbd>
                          ))}
                        </KbdGroup>
                        <span className="text-foreground/85 text-sm leading-snug">{s.verb}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground mt-6 text-sm">
              <span className="font-mono">{modKey}</span> is <span className="font-mono">⌘</span> on
              macOS, <span className="font-mono">Ctrl</span> on Windows and Linux. All shortcuts are
              rebindable from Settings → Shortcuts.
            </p>
          </Section>

          {/* ───── Pi in depth ─────────────────────────────────────────── */}
          <Section id="pi-deeper" title="Pi, in depth" topSpacing>
            <p>
              Anthropic + Claude Sonnet 4.6 is the recommended setup, but Pi is a model-agnostic
              harness. You can switch providers at any time from Settings without re-onboarding.
            </p>
          </Section>

          <Section id="providers" title="Model catalog" subsection>
            <p>
              Settings exposes the full Pi model registry bundled with Pilog. Browse pricing and
              context windows at{' '}
              <Link
                href="https://pi.dev/models"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline underline-offset-4"
              >
                pi.dev/models
              </Link>
              , then use the same provider and model id here. Default for drafts: Anthropic{' '}
              <span className="font-mono">claude-sonnet-4-6</span>.
            </p>
            <ul className="text-foreground/90 mt-4 space-y-2 text-base leading-relaxed">
              <li>
                <span className="text-foreground font-medium">Direct APIs:</span> Anthropic, OpenAI,
                Google (Gemini), DeepSeek, xAI, Mistral, Groq, and others.
              </li>
              <li>
                <span className="text-foreground font-medium">Gateways:</span> OpenRouter, Vercel AI
                Gateway, Amazon Bedrock, Google Vertex, Azure OpenAI, Cloudflare AI Gateway.
              </li>
              <li>
                <span className="text-foreground font-medium">Coding-agent sign-in:</span> GitHub
                Copilot, OpenAI Codex, OpenCode, Kimi Coding (OAuth where supported).
              </li>
              <li>
                <span className="text-foreground font-medium">Custom &amp; local:</span> Ollama, LM
                Studio, vLLM, or OpenAI-compatible endpoints via{' '}
                <span className="font-mono">~/.pi/agent/models.json</span>. See{' '}
                <Link
                  href="#local-models"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  Local models (Ollama)
                </Link>{' '}
                below. Results vary with smaller models.
              </li>
            </ul>
          </Section>

          <Section id="local-models" title="Local models (Ollama)" subsection>
            <p>
              Pilog is local-first for your journal: notes, drafts, and run history stay in SQLite
              on your machine. <span className="text-foreground font-medium">Generate Drafts</span>{' '}
              is the step that can leave it, unless Pi talks to a model running locally.{' '}
              <Link
                href="https://ollama.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline underline-offset-4"
              >
                Ollama
              </Link>{' '}
              is the recommended path; LM Studio and other OpenAI-compatible servers use the same{' '}
              <span className="font-mono">models.json</span> pattern with a different{' '}
              <span className="font-mono">baseUrl</span>.
            </p>

            <ol className="mt-4 space-y-3">
              <Step n="01">
                Install Ollama and confirm it is running (the menu-bar app on macOS, or{' '}
                <span className="font-mono">ollama serve</span> on Linux).
              </Step>
              <Step n="02">
                Pull a coding-oriented model. For example:
                <DocsCommand>ollama pull qwen2.5-coder:7b</DocsCommand>
                Larger models draft more reliably; smaller ones are faster on modest hardware.
              </Step>
              <Step n="03">
                Create or edit <span className="font-mono">~/.pi/agent/models.json</span> so Pi can
                reach Ollama (use the model tag you pulled):
                <DocsCodeBlock>
                  {`{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [{ "id": "qwen2.5-coder:7b" }]
    }
  }
}`}
                </DocsCodeBlock>
                Ollama ignores <span className="font-mono">apiKey</span>; Pi requires the field.
                Full options are in{' '}
                <Link
                  href="https://pi.dev/docs/latest/models"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  Pi&apos;s custom-models docs
                </Link>
                .
              </Step>
              <Step n="04">
                In Pilog, open Settings → Provider &amp; Model. Choose{' '}
                <span className="text-foreground font-medium">ollama</span> and your model. Paste{' '}
                <span className="font-mono">ollama</span> (or any placeholder) into the API key
                field and click <span className="text-foreground font-medium">Configure Pi</span>.
                Pilog stores it in OS-backed safe storage; Ollama does not validate it.
              </Step>
              <Step n="05">
                Generate a test draft. Traffic stays on <span className="font-mono">localhost</span>
                . Publishing to GitHub still requires network access and remains a separate,
                explicit step.
              </Step>
            </ol>

            <Aside title="If Ollama does not appear">
              Quit and reopen Pilog after editing <span className="font-mono">models.json</span>, or
              use <span className="text-foreground font-medium">Import existing Pi config</span> if
              you already use the <span className="font-mono">pi</span> CLI with Ollama on this
              machine.
            </Aside>
          </Section>

          <Section id="api-keys" title="Getting credentials" subsection>
            <p className="text-foreground/90 text-base leading-relaxed">
              Which key or sign-in you need depends on the provider you pick. The onboarding path
              below uses Anthropic; for any other provider, open{' '}
              <Link
                href="https://pi.dev/models"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline underline-offset-4"
              >
                pi.dev/models
              </Link>{' '}
              and use that vendor&apos;s console (or OAuth, for coding-agent providers).
            </p>
            <ul className="text-foreground/90 mt-4 space-y-2.5 text-base leading-relaxed">
              <li>
                <span className="text-foreground font-medium">Anthropic (recommended):</span>{' '}
                <Link
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  console.anthropic.com/settings/keys
                </Link>{' '}
                → <em>Create Key</em>. Add credit at{' '}
                <Link
                  href="https://console.anthropic.com/settings/billing"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  Billing
                </Link>
                . Typical draft generation costs a few cents per run.
              </li>
              <li>
                <span className="text-foreground font-medium">OpenAI:</span>{' '}
                <Link
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  platform.openai.com/api-keys
                </Link>{' '}
                → <em>Create new secret key</em>.
              </li>
              <li>
                <span className="text-foreground font-medium">Google (Gemini):</span>{' '}
                <Link
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  aistudio.google.com/apikey
                </Link>
                .
              </li>
              <li>
                <span className="text-foreground font-medium">OpenRouter:</span>{' '}
                <Link
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 underline underline-offset-4"
                >
                  openrouter.ai/keys
                </Link>
                . One key reaches many catalog models.
              </li>
            </ul>
            <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
              API keys are stored in OS-backed safe storage, never in Pilog&apos;s SQLite database
              and never written to logs.
            </p>
          </Section>

          <Section id="switch-model" title="Switching models" subsection>
            <p>
              Open Settings → Provider &amp; Model, change the selection, and click{' '}
              <span className="text-foreground font-medium">Change…</span>. The change applies to
              new draft generations; runs in the agent run history retain the model they were
              generated with so the audit trail stays honest.
            </p>
          </Section>

          {/* ───── Review & publish ───────────────────────────────────── */}
          <Section id="review-publish" title="Review & publish" topSpacing>
            <p>
              Drafts land in the Drafts view (<InlineKeys modKey={modKey} tokens={['MOD', '2']} />)
              unpublished. Read each one, edit the title or body inline, accept the suggested labels
              or pick your own, and press <InlineKeys modKey={modKey} tokens={['MOD', '↵']} /> to
              publish to GitHub. Pilog writes the issue and keeps a local publish-log entry linking
              the draft, the source notes, and the resulting issue URL.
            </p>
            <p>
              <span className="text-foreground font-medium">Auto-publish</span> exists for power
              users but is off by default, scoped per-linked-repo, and logged. Auto-publish never
              applies retroactively; only new drafts generated after the toggle is enabled are
              eligible.
            </p>
          </Section>

          {/* ───── Privacy ────────────────────────────────────────────── */}
          <Section id="privacy" title="Privacy & local-first" topSpacing>
            <p>
              Pilog is local-first by stance, not as a fallback. Your journal (notes, drafts, repo
              metadata, and the full agent run history) lives in local SQLite. Secrets (GitHub OAuth
              tokens and Pi provider keys) live in OS credential storage: Keychain on macOS, DPAPI
              on Windows, the desktop keyring on Linux.
            </p>
            <p>
              <span className="text-foreground font-medium">Fully local</span> means two things:
              journal data on disk (always), and draft inference on your machine (only when Pi uses
              a local model such as Ollama. See{' '}
              <Link
                href="#local-models"
                className="text-primary hover:text-primary/80 underline underline-offset-4"
              >
                Local models (Ollama)
              </Link>
              ). The default onboarding path uses a cloud API; that is still BYOK and explicit, but
              Generate sends context to the vendor.
            </p>
            <p>Data leaves your machine in exactly two situations, both under your control:</p>
            <ul className="text-foreground/90 mt-2 space-y-2 text-base leading-relaxed">
              <li>
                <span className="text-foreground font-medium">Generate Drafts</span> sends the
                selected notes and a bounded slice of repository context to your configured Pi
                provider (<span className="text-foreground">localhost</span> with Ollama, otherwise
                the provider&apos;s API. Drafts and run history are saved locally either way.
              </li>
              <li>
                <span className="text-foreground font-medium">Publish</span> sends the specific
                draft you&apos;re publishing to GitHub as a new issue. Local drafts stay on your
                machine until you publish them.
              </li>
            </ul>
            <p>
              There is no telemetry, no usage analytics, and no automatic crash reporting. The
              publish log makes GitHub writes auditable.
            </p>
          </Section>

          {/* ───── Troubleshooting ────────────────────────────────────── */}
          <Section id="troubleshooting" title="Troubleshooting" topSpacing>
            <Trouble title="The hotkey doesn’t open the scratchpad">
              Another app may have claimed the same combination at the OS level. Open Settings →
              Shortcuts and pick an unused chord, or quit the conflicting app. macOS occasionally
              needs Pilog to be granted <em>Accessibility</em> in System Settings → Privacy &amp;
              Security before global hotkeys register.
            </Trouble>
            <Trouble title="Pi setup says “missing credential” after I pasted a key">
              Confirm the key wasn&apos;t pasted with whitespace. Anthropic keys start with{' '}
              <span className="font-mono">sk-ant-</span>, OpenAI keys with{' '}
              <span className="font-mono">sk-</span>. If the key looks right, try Import existing Pi
              config and re-save.
            </Trouble>
            <Trouble title="Generate Drafts is disabled">
              Drafts can only be generated when (a) the selected notes all belong to the same linked
              repository, (b) Pi is fully configured (provider, model, key), and (c) GitHub is
              connected. Settings shows a one-line status for each.
            </Trouble>
            <Trouble title="Linux: secure storage is unavailable">
              Pilog needs a desktop keyring exposed to Electron, usually GNOME Keyring or KWallet
              with <span className="font-mono">libsecret</span>. Headless sessions, minimal
              containers, and some WSL2 setups don&apos;t provide one. Run Pilog in a desktop
              session, or install <span className="font-mono">gnome-keyring</span> /{' '}
              <span className="font-mono">libsecret-1-0</span> for your distribution.
            </Trouble>
            <Trouble title="The Windows installer triggers a SmartScreen warning">
              Preview builds are unsigned during MVP. Click <em>More info</em> → <em>Run anyway</em>
              . Stable signed builds will follow once the code-signing certificate is in place.
            </Trouble>
            <p className="text-muted-foreground mt-6 text-sm leading-relaxed">
              Still stuck? Open an issue on{' '}
              <Link
                href="https://github.com/nick-neely/pilog/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline underline-offset-4"
              >
                GitHub
              </Link>
              .
            </p>
          </Section>
        </article>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────
 * Layout primitives — kept inline because they're docs-specific helpers
 * with no reuse outside this page. Section anchors carry scroll-margin so
 * the page header doesn't hide the heading on in-page navigation.
 * ──────────────────────────────────────────────────────────────────── */

function Section({
  id,
  title,
  eyebrow,
  children,
  topSpacing = false,
  subsection = false
}: {
  id: string
  title: string
  eyebrow?: string
  children: React.ReactNode
  topSpacing?: boolean
  subsection?: boolean
}) {
  // scroll-mt keeps anchored navigation clear of the sticky site header.
  return (
    <section
      id={id}
      className={[
        'scroll-mt-24',
        subsection ? 'mt-10' : 'mt-14',
        topSpacing && !subsection ? 'border-border/60 mt-20 border-t pt-14' : ''
      ].join(' ')}
    >
      {eyebrow && (
        <p className="text-muted-foreground mb-2 font-mono text-xs tracking-[0.08em] uppercase">
          {eyebrow}
        </p>
      )}
      {subsection ? (
        <h3 className="font-heading text-foreground text-xl font-medium tracking-tight">{title}</h3>
      ) : (
        <h2 className="font-heading text-foreground text-3xl leading-tight font-normal tracking-tight md:text-[2rem]">
          {title}
        </h2>
      )}
      <div className="text-foreground/85 mt-5 max-w-[68ch] space-y-4 text-base leading-relaxed">
        {children}
      </div>
    </section>
  )
}

function Step({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className="text-muted-foreground tabular shrink-0 font-mono text-[0.7rem] leading-7"
      >
        {n}
      </span>
      <div className="text-foreground/90 min-w-0 flex-1 text-base leading-relaxed">{children}</div>
    </li>
  )
}

function InlineKeys({ tokens, modKey }: { tokens: string[]; modKey?: SiteModKeyGlyph }) {
  return (
    <KbdGroup className="mx-0.5 inline-flex align-baseline">
      {tokens.map((k, i) => (
        <Kbd key={`${i}-${k}`}>{modKey && k === 'MOD' ? modKey : k}</Kbd>
      ))}
    </KbdGroup>
  )
}

function Aside({ title, children }: { title: string; children: React.ReactNode }) {
  // A quiet supporting block. Tonal separation only — no colored side-stripe,
  // no decorative icon, no nested card. Title sits on the same baseline grid
  // as body copy.
  return (
    <div className="border-border bg-secondary/40 mt-6 rounded-lg border p-5">
      <p className="text-foreground font-mono text-xs tracking-[0.12em] uppercase">{title}</p>
      <div className="text-foreground/85 mt-2 space-y-2 text-sm leading-relaxed">{children}</div>
    </div>
  )
}

function Callout({ children }: { children: React.ReactNode }) {
  // The single moss-tinted block on the page — used once, for the model
  // recommendation. The bg-primary/8 tone keeps it well under the
  // ≤10% accent rule from DESIGN.md.
  return (
    <div className="border-primary/30 bg-primary/[0.06] mt-6 rounded-lg border p-5">
      <p className="text-foreground/90 text-base leading-relaxed">{children}</p>
    </div>
  )
}

function Trouble({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="border-border/60 group border-b py-4 first:border-t">
      <summary className="text-foreground hover:text-foreground/90 flex cursor-pointer items-center justify-between gap-4 text-base font-medium [&::-webkit-details-marker]:hidden">
        <span className="text-foreground/90">{title}</span>
        <span
          aria-hidden
          className="text-muted-foreground font-mono text-sm transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="text-muted-foreground mt-3 max-w-[64ch] text-sm leading-relaxed">
        {children}
      </div>
    </details>
  )
}
