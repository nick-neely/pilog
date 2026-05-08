---
name: PiLog
description: A developer's bedside journal — paper-warm, type-led, moss-accented.
colors:
  parchment: "oklch(0.96 0.006 75)"
  parchment-light: "oklch(0.97 0.005 75)"
  ash: "oklch(0.92 0.006 75)"
  pencil: "oklch(0.48 0.012 60)"
  ink: "oklch(0.22 0.012 60)"
  border-warm: "oklch(0.88 0.008 70)"
  moss: "oklch(0.48 0.08 145)"
  moss-lifted: "oklch(0.6 0.085 145)"
  clay: "oklch(0.5 0.16 28)"
  clay-lifted: "oklch(0.64 0.155 28)"
  dark-ink: "oklch(0.18 0.012 60)"
  dark-card: "oklch(0.22 0.014 60)"
  dark-ash: "oklch(0.26 0.014 60)"
  dark-pencil: "oklch(0.7 0.012 70)"
  dark-paper: "oklch(0.92 0.008 75)"
typography:
  display:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-0.005em"
  headline:
    fontFamily: "Source Serif 4 Variable, Source Serif 4, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Sans Variable, IBM Plex Sans, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.01em"
  mono:
    fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "0.3rem"
  md: "0.4rem"
  lg: "0.5rem"
  xl: "0.7rem"
  2xl: "0.9rem"
components:
  button-primary:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.parchment-light}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.moss}"
    textColor: "{colors.parchment-light}"
  button-outline:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.25rem"
  button-ghost:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.25rem"
  button-destructive:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.clay}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.25rem"
  alert-dialog-content:
    backgroundColor: "{colors.parchment-light}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "1.5rem"
  alert-dialog-overlay:
    backgroundColor: "{colors.ink}"
---

# Design System: PiLog

## 1. Overview

**Creative North Star: "The Reading-Room Journal"**

PiLog is a quiet annotated page in a sunlit reading room. The neutrals are paper-warm and faintly ash-toned — never `#fff`, never `#000`, never zinc. The single accent is **Reading-Room Moss** (`oklch(0.48 0.08 145)` light, lifted to `oklch(0.6 0.085 145)` for low-ambient dark): the color a librarian might use for marginalia. Type carries the weight a frame would in a SaaS dashboard: **Source Serif 4** for display gravity, **IBM Plex Sans** for the humanist body, **IBM Plex Mono** for code, paths, and editor body. Surfaces are flat by default; depth is conveyed by tonal contrast on the warm-neutral ramp, never by shadow.

The system explicitly rejects three patterns named in PRODUCT.md: **the generic AI-tool aesthetic** (purple/teal gradients, glassmorphism, gradient text, "✨ AI" garnish), **the SaaS-cliché dashboard** (hero-metric tiles, identical icon-heading-text card grids, side-stripe colored borders, friendly-rounded illustrations), and **the stock shadcn dashboard demo look** (default theme, Inter, zinc neutrals, blue accent — the path of least resistance). PiLog uses shadcn as a primitive layer; the visual identity is committed and recognizable on its own.

Both light and dark themes are first-class. Light is the daylight scene — a developer at 11am, daylight raking the desk, glancing into PiLog to drop a thought and glancing out. Dark is the same developer at 11pm, monitor as the only light source, the moss reading true at low ambient light. Both are audited against WCAG 2.2 AA on every text/role pairing.

**Key Characteristics:**

- Paper-warm tinted neutrals at ~75° hue light / ~60° hue dark; never `#fff`, never `#000`, never untinted zinc.
- Single moss-green accent, used on ≤10% of any given screen.
- Source Serif 4 (display) + IBM Plex Sans (body) + IBM Plex Mono (code/editor).
- Flat by default; depth conveyed through tonal contrast on the warm-neutral ramp, not shadow.
- Quiet shapes: 8px base radius, buttons settle on `rounded-md` (~6.4px), elevated dialogs on `rounded-xl` (~11px). No pill shapes.
- Responsive motion only; every animation justifiable as feedback. `prefers-reduced-motion` honored.
- Keyboard-first; focus rings visible and on-brand (moss, 3px, never suppressed).
- Editor (CodeMirror/Milkdown) is the gravitational center of the scratchpad; UI chrome must defer to it.

## 2. Colors: The Reading-Room Palette

A paper-warm neutral field with a single moss accent. The canonical color space is OKLCH so neutrals stay even as lightness shifts and the moss reads true on calibrated and sRGB displays.

### Primary

- **Reading-Room Moss** (`oklch(0.48 0.08 145)` light / `oklch(0.6 0.085 145)` dark): the system's only saturated accent. Reserved for primary actions (Generate Drafts, Publish), focus rings, active state on the rare element where state must read at a glance, and the sidebar's primary affordance. **Not** used for decoration, **not** for body text, **not** to "add color" to empty surfaces. Lifted in dark mode so it reads true at low ambient light.

### Neutral

The neutral ramp is the project's main visual surface. Light steps are tinted toward warm yellow at ~75° hue, low chroma (~0.005–0.012), so the page reads as paper rather than sterile gray. Dark steps shift slightly inward to ~60° hue so ink-warm shadows feel built from the same family.

**Light:**
- **Parchment** (`oklch(0.96 0.006 75)`): the default page surface, card surface, and scratchpad canvas.
- **Parchment-Light** (`oklch(0.97 0.005 75)`): popover and sidebar surface; one tonal step lighter than the page so floating chrome separates by tone, not shadow.
- **Ash** (`oklch(0.92 0.006 75)`): subtle surface separation — inbox row hover, settings group dividers, the "second card under the first" surface where unavoidable.
- **Pencil** (`oklch(0.48 0.012 60)`): supporting body text, metadata, file paths. Meets AA at body sizes on Parchment.
- **Ink** (`oklch(0.22 0.012 60)`): primary body text and headings. Never `#000`. The warm tint is what stops the system from reading clinical.
- **Border-Warm** (`oklch(0.88 0.008 70)`): the only border color in light. 1px, low-contrast, never colored, never striped.

**Dark:**
- **Dark Ink** (`oklch(0.18 0.012 60)`): the page surface. Warm-tinted dark, never blue-black.
- **Dark Card** (`oklch(0.22 0.014 60)`): card and popover surface; one step up from the page.
- **Dark Ash** (`oklch(0.26 0.014 60)`): muted/secondary surface for separation.
- **Dark Pencil** (`oklch(0.7 0.012 70)`): supporting body text, metadata.
- **Dark Paper** (`oklch(0.92 0.008 75)`): primary text; reads as warm paper on the dark page.
- Border in dark is a warm-tinted alpha overlay (`oklch(0.92 0.008 75 / 8%)`), keeping the same ink-on-paper relationship inverted.

### Tertiary

- **Clay** (`oklch(0.5 0.16 28)` light / `oklch(0.64 0.155 28)` dark): destructive and error states. A warm clay-orange, not a pure red, so destructive affordances read in the same paper world as the rest of the system. Used on the Destructive button variant and `aria-invalid` field rings.

### Named Rules

**The One Voice Rule.** Reading-Room Moss appears on ≤10% of any given screen. Its rarity is the point. If two moss elements are visible at once, one of them is wrong.

**The Warm Neutral Rule.** No neutral in this system is pure gray. Every step has chroma ≥ 0.005 toward warm yellow (light) or warm orange (dark). Pure `#000`, pure `#fff`, and untinted zinc/slate are prohibited.

**The Color-Independence Rule.** Status (`unprocessed` / `drafted` / `published` / `dismissed`), priority (`low` / `medium` / `high`), and confidence (`low` / `medium` / `high`) are never conveyed by hue alone. Every state carries a label, glyph, or shape signal alongside any color cue. Non-negotiable; PRODUCT.md commits the system to colorblind safety at MVP.

**The Single-Border Rule.** Every visible border in this system is `--border` at 1px. Borders are never colored to convey state. Use a label, glyph, or tonal-contrast surface change instead.

## 3. Typography

**Display Font:** Source Serif 4 (Adobe; variable; Georgia / Iowan Old Style fallbacks)
**Body Font:** IBM Plex Sans (IBM; variable; system-ui fallback)
**Code/Mono Font:** IBM Plex Mono (IBM; static 400/500; ui-monospace fallback)

**Character.** Source Serif 4 gives PiLog the gravity of a thoughtful publication: humane, slightly literary, entirely legible at display sizes without going magazine-precious. IBM Plex Sans keeps every list, label, and microcopy line legible at any size — a humanist sans engineered to coexist with its serif and mono siblings. IBM Plex Mono is editor-grade and visually paired with the body sans, so reading code in note bodies, file paths in draft cards, and content in the CodeMirror/Milkdown editor all feel intentional rather than incidental.

### Hierarchy

- **Display** (Source Serif 4, weight 400, `clamp(1.75rem, 3.5vw, 2.5rem)`, line-height 1.15, letter-spacing −0.005em): inbox section titles, settings page headers, the rare scratchpad title. Sparingly used.
- **Headline** (Source Serif 4, weight 500, 1.5rem / 24px, line-height 1.25): draft card titles, dialog headers (already wired via `font-heading` on `AlertDialogTitle`).
- **Title** (IBM Plex Sans, weight 600, 1rem / 16px, line-height 1.4): UI section labels, settings group titles.
- **Body** (IBM Plex Sans, weight 400, 0.9375rem / 15px, line-height 1.55, **65–75ch max line length** in note rendering surfaces): primary reading text, draft descriptions, settings copy.
- **Label** (IBM Plex Sans, weight 500, 0.8125rem / 13px, +0.01em letter-spacing, mixed-case never uppercase-everything): button text, input labels, microcopy.
- **Mono** (IBM Plex Mono, weight 400, 0.875rem / 14px, line-height 1.6): note bodies in editor, file paths in affected-files lists, code blocks, agent run output. Never used decoratively. Bumps to weight 500 for emphasis in code; 700 is unavailable and not needed.

### Named Rules

**The Hierarchy-Through-Type Rule.** Visual hierarchy comes from typeface, weight, and scale (≥1.25 ratio between adjacent steps) — not from background color, side-stripes, or boxed cards. If you're tempted to add a colored border to make a section stand out, change the type instead.

**The Editor-Gravitational Rule.** When the scratchpad is open, the IBM Plex Mono editor body is the visual center. UI chrome (close button, save shortcut hint, repo selector) sits at the periphery, lower contrast than the editor body. The editor must never feel decorated.

**The No-Decorative-Type Rule.** No gradient text, no `background-clip: text`, no decorative all-caps tracking, no display weights below 200. Emphasis is weight or size, never effect. Tabular figures (`.tabular`) are opt-in for inbox counts, dates, and run logs only, not global.

## 4. Elevation

PiLog is **flat by default**. Surfaces separate via tonal layering on the warm-neutral ramp, not shadow. Parchment-Light over Parchment, Ash over Parchment, Dark Card over Dark Ink — that's how depth reads.

Shadow exists only as a state response, never as a baseline. The scratchpad window is the lone exception — being a separate Electron window, it carries the OS's native window shadow, which is correct; do not add a CSS shadow on top.

### Shadow Vocabulary

Three roles only:

- **Hover lift** (very light, short offset; reserved for draft cards on hover only): signal that the card is interactive. Disabled under `prefers-reduced-motion`. Use sparingly; most surfaces don't take hover lift at all.
- **Focus ring** (`focus-visible:ring-3 focus-visible:ring-ring/30` + `focus-visible:border-ring`): keyboard focus on every interactive element. Always visible, never suppressed for aesthetics. The ring color resolves to moss in both themes.
- **Active dialog** (`shadow-xl ring-1 ring-foreground/5`): used only on the alert-dialog content, where the surface genuinely lifts off the page. Documented in `alert-dialog.tsx` as the lone exception to flat-by-default.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, focus, active dialog). A static screenshot of any surface in its rest state contains zero `box-shadow`.

**The Tonal-Depth Rule.** When two surfaces need separation, the answer is tonal contrast on the warm-neutral ramp (Parchment-Light over Parchment in light, Dark Card over Dark Ink in dark), not a shadow. Borders are 1px Border-Warm (light) or warm-tinted alpha (dark); never a colored stripe.

**The No-Glassmorphism Rule.** Backdrop blur is forbidden. The alert-dialog overlay uses a tonal scrim (`bg-foreground/40` light, `bg-background/70` dark) — same hue family as the rest of the system, no `backdrop-filter`, no glass. PRODUCT.md names "glassmorphic cards" and "decorative blurs" as anti-references; this rule is the visual enforcement.

## 5. Components

The implemented primitives at this writing are `Button` and `AlertDialog`. The Inbox / Scratchpad / Settings feature surfaces exist but inherit tokens; they have no custom themed components yet. As feature surfaces solidify, document their primitives here on the next `$impeccable document` pass.

### Buttons

- **Shape:** quiet, paper-grade — `rounded-md` (~6.4px), 1px transparent border for `bg-clip-padding` color crossover. Never pill. The previous `rounded-4xl` (~21px) read decorative; this is the corrected baseline.
- **Default sizes:** `default` (h-9 / 36px), `xs` (h-6), `sm` (h-8), `lg` (h-10), plus `icon` square variants. Padding is gap-aware around inline icons.
- **Primary (`variant="default"`):** moss background, parchment-light text, hover at `bg-primary/80`. Use only for the single most consequential action on screen (Generate Drafts, Publish).
- **Outline:** Border-Warm border on Parchment, ink text. Hover shifts background to muted Ash. The default for "secondary action with chrome."
- **Secondary:** Ash background, ink text. Slightly more weight than Outline; use for paired actions that shouldn't compete with the primary.
- **Ghost:** transparent background, ink text. Hover shifts to Ash. Use for tertiary or chrome-adjacent actions where any frame would be too loud.
- **Destructive:** Clay-tinted background at `destructive/10`, Clay text, hover at `destructive/20`. Warm-clay, not pure red. Reads in the paper world.
- **Link:** primary-color text with underline on hover. Use only inside running prose.
- **Hover/Focus/Active:** primary darkens; focus-visible shows a 3px moss ring at 30% alpha + moss border; active translates the button down 1px (`active:translate-y-px`) — small tactile feedback, on `transform`, not layout.
- **Disabled:** 50% opacity, pointer-events disabled, but otherwise structurally identical (no greyed-out fill).

### Alert Dialog

- **Overlay:** tonal scrim at `bg-foreground/40` (light) / `bg-background/70` (dark). **No `backdrop-blur`.** PRODUCT.md anti-references list glassmorphic surfaces by name; the corrected overlay is plain ink alpha, in the same hue family as the rest of the system.
- **Content:** Popover-Light surface, `rounded-xl` (~11px) — moderate, not pill — with `p-6` (24px) interior padding. Carries the lone documented `shadow-xl ring-1 ring-foreground/5` because this is the system's one elevated-surface role. Dark adjusts to `ring-foreground/10`.
- **Title:** `font-heading` (Source Serif 4) at `text-lg font-medium`. The dialog is the place display serif appears in chrome.
- **Description:** `text-sm text-balance text-muted-foreground` — Pencil text on Parchment-Light, balanced for short forms.
- **Action / Cancel:** Action delegates to the primary `Button` variant; Cancel defaults to outline. The corner radius on both inherits the small `rounded-md` baseline; the dialog itself is the only `rounded-xl` surface in view.

### Coming next (not yet implemented; track here when wired)

- Inputs / text fields (quiet stroke at rest, moss focus ring, no internal shadows)
- Inbox row (dense, scannable, keyboard-first; status conveyed by label + glyph + tonal contrast, never hue alone)
- Draft card (anchored visibly to its source notes; confidence and rationale always present, never collapsed by default)
- Scratchpad editor surface (the signature component; CodeMirror/Milkdown body in IBM Plex Mono)
- Settings group (a single Ash-on-Parchment surface with type-driven sectioning, not nested cards)
- Sidebar (Parchment-Light surface, ink text, moss primary affordance)

## 6. Do's and Don'ts

### Do:

- **Do** anchor color tokens in OKLCH. Neutrals stay even as lightness shifts and moss reads true across displays.
- **Do** use Reading-Room Moss only for primary actions, focus rings, and at-a-glance state where unavoidable. ≤10% of any screen.
- **Do** convey status, priority, and confidence with a label, glyph, *or* shape alongside any color cue. The Color-Independence Rule is non-negotiable.
- **Do** lean on type, weight, and tonal neutrals for hierarchy. Headers earn their weight; backgrounds don't.
- **Do** respect `prefers-reduced-motion`. Reduced-motion users get instant transitions, never broken interactions.
- **Do** keep focus rings visible and on-brand. Use `focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:border-ring`; never suppress.
- **Do** treat the IBM Plex Mono editor as the gravitational center of the scratchpad. UI chrome defers.
- **Do** ship the warm neutral. Every neutral has chroma ≥ 0.005 toward warm yellow (light) or warm orange (dark).
- **Do** keep body line length at 65–75ch in any reading-heavy surface (draft body, source notes, settings copy).
- **Do** use `.tabular` (font-variant-numeric: tabular-nums) on inbox counts, dates, and run-log timestamps; not on flowing prose.
- **Do** separate stacked surfaces with tonal contrast (Parchment-Light over Parchment, Dark Card over Dark Ink), not with shadow.

### Don't:

- **Don't** ship the **generic AI-tool aesthetic** named in PRODUCT.md: no purple/teal gradients, no glassmorphic cards, no gradient text, no "✨ AI" badges, no shimmer, no wand icons, no "magic" copy.
- **Don't** ship the **SaaS-cliché dashboard** named in PRODUCT.md: no hero-metric template (big number / small label / supporting stats / gradient accent), no identical icon-heading-text card grids, no friendly-rounded illustrations, no decorative blurs.
- **Don't** ship the **stock shadcn dashboard demo look** named in PRODUCT.md: default shadcn theme + Inter + zinc neutrals + blue accent are the failure mode this design exists to refuse. (Note: the dark sidebar's `oklch(0.488 0.243 264.376)` blue-purple from the original shadcn neutral preset has been replaced with moss; never reintroduce it.)
- **Don't** use `#000` or `#fff` anywhere. Pure neutrals are prohibited.
- **Don't** use side-stripe borders. `border-left` / `border-right` greater than 1px as a colored accent on cards, list items, callouts, or alerts is prohibited.
- **Don't** use `background-clip: text` for gradient text. Single solid color, emphasis via weight or size.
- **Don't** use `backdrop-filter` / `backdrop-blur-*`. The alert-dialog overlay is a tonal scrim, never glass.
- **Don't** reach for a modal as the first thought. Inline and progressive disclosure first; modal only when the action genuinely takes the user out of the current task (publish-confirmation is the canonical case).
- **Don't** nest cards. A card inside a card is always wrong.
- **Don't** wrap everything in a container. Most surfaces don't need one.
- **Don't** animate CSS layout properties (`width`, `height`, `top`, `left`, `margin`). `transform`, `opacity`, and `color` only.
- **Don't** suppress focus rings for aesthetics. The keyboard-first promise is honored visibly.
- **Don't** use color alone for status, priority, or confidence — ever.
- **Don't** add a second accent because "the page feels empty." Empty is the design.
- **Don't** restore `rounded-4xl` on buttons or pill shapes anywhere. The Reading-Room Journal's shapes are quiet.
