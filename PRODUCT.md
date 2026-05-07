# Product

## Register

product

## Users

Solo developers, indie hackers, freelancers, consultants, small GitHub-native teams, and OSS maintainers — people working in a local repo who notice small issues constantly while in flow ("save button needs a loading state", "auth redirect is broken, maybe middleware?", "settings spacing is off on mobile").

The job to be done is **catch the thought without losing the flow**, then later **convert a pile of rough notes into clean, repo-aware GitHub issues** without context-switching into the GitHub UI for each one. Sessions are bursty: capture is constant and milliseconds matter; triage is occasional and care matters.

The primary surface is the desktop app itself — a global-hotkey scratchpad and an inbox/review/settings shell. There is no marketing/landing surface in MVP scope.

## Product Purpose

PiLog separates **capture** from **triage**. The scratchpad is the lightest possible markdown surface, opened by a global hotkey, designed to disappear from your attention as soon as the note is written. The inbox accumulates raw notes; on demand, a local Pi-driven agent reads them alongside the active repository and produces grouped, repo-aware GitHub issue drafts (titles, bodies, suggested labels, acceptance criteria, affected files, confidence, and concise rationale).

Success looks like: a note captured in under three seconds, a pile of five rough notes turning into one to three useful issue drafts, every draft linked back to its source notes, every draft auditable before it's published. Auto-publish exists for power users but is explicit, repo-scoped, and logged.

The product is local-first by default — notes, drafts, repo metadata, and agent run history live in local SQLite; secrets live in OS credential storage; provider/model configuration is delegated to Pi (BYOK) but surfaced inside PiLog.

## Brand Personality

**Warm, crafted, calm.** PiLog should feel like a developer's bedside journal — a quiet, considered editor that respects what you're writing and the moment you're writing it. References we admire: iA Writer, Things 3, Obsidian, Bear, Linear's restraint without Linear's coolness.

Voice: precise, plainspoken, never cute. Never ships an em dash. Never says "magic" or "✨". Doesn't over-explain. Microcopy reads like a thoughtful collaborator who has worked on a real codebase.

Emotional goals:
- **At capture time:** unobtrusive, reassuring, fast. The user should feel the window is *waiting for them*, not demanding attention.
- **At triage time:** confident, transparent, controllable. The user should feel they understand what the agent saw and why it grouped what it grouped.
- **At publish time:** deliberate, auditable. Never a surprise.

## Anti-references

Three traps PiLog must actively avoid:

1. **The generic AI-tool aesthetic.** No purple/teal gradients, no glassmorphic cards, no gradient text, no "✨ AI" badges, no shimmer effects, no wand icons, no "magic" copy. PiLog uses an LLM; it is not "an AI app."
2. **SaaS-cliché dashboards.** No hero-metric template (big number / small label / supporting stats / gradient accent). No identical icon-heading-text card grids. No side-stripe colored borders on cards or alerts. No friendly-rounded onboarding illustrations.
3. **The stock shadcn dashboard demo look.** Default shadcn theme + Inter + zinc neutrals + one blue accent is the path of least resistance and lands PiLog among 200 indistinguishable AI-tool dashboards. shadcn is a primitive layer; the visual identity must be committed and recognizable on its own.

Specific patterns to avoid: modal-as-first-thought, nested cards, dense top bars with breadcrumbs everywhere, persistent banners, identical-card grids, decorative blurs.

## Design Principles

1. **Capture before triage.** The scratchpad is a sanctuary, not a form. No chrome competes with the writing. Required fields, label pickers, and repo selectors live elsewhere or are deferred until triage. The first beat of the experience is just typing.
2. **Show the source, always.** Every generated issue draft is anchored visibly to its source notes and a short, user-facing reasoning summary. The user is never asked to trust opaque output — confidence is named, rationale is concise, and the raw notes are never hidden behind an expander by default on the review surface.
3. **Local-first is a stance, not a constraint.** Local SQLite, OS keychain, BYOK provider config, an auditable publish log. Privacy and ownership are the posture, not a fallback. The UI should make this legible — settings should make it obvious what leaves the machine and when.
4. **Restraint over reflex.** When the easy answer is "add another card," "open a modal," or "add a gradient," it's the wrong answer. The product earns weight through typography, rhythm, and considered surfaces — not through decoration. Density should come from signal, never from chrome.
5. **Keyboard-first, mouse-welcome.** This is a tool used by people who already live in their keyboard. Every triage and review action has a shortcut; the mouse is a courtesy, not the primary path. The hotkey-driven scratchpad is the product's defining gesture; that posture should propagate.

## Accessibility & Inclusion

- **Target:** WCAG 2.2 AA across all surfaces.
- **Contrast:** all text and meaningful icons audited against AA contrast (4.5:1 body, 3:1 large) on both themes if a dark theme ships.
- **Motion:** respect `prefers-reduced-motion`. Default motion is gentle and organic; reduced-motion users get instant transitions, never broken interactions. No auto-playing or looping animation in product surfaces.
- **Color independence:** status (`unprocessed` / `drafted` / `published` / `dismissed`), priority (`low` / `medium` / `high`), and confidence (`low` / `medium` / `high`) are never conveyed by hue alone. Each carries a label, glyph, or shape signal alongside any color cue. Colorblind-safe palette commitments captured in DESIGN.md.
- **Keyboard parity:** every action in the scratchpad, inbox, and draft-review surfaces is reachable and operable from the keyboard. Focus order is deliberate; focus rings are visible and on-brand, never suppressed for aesthetics.
- **Screen reader:** dynamic regions (publish results, agent run progress, draft generation) use appropriate live regions. Source-note attributions on drafts are announced.
