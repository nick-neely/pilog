## <!-- SEED: re-run $impeccable document once there's code to capture the actual tokens and components. -->

name: PiLog
description: A developer's bedside journal — paper-warm, type-led, moss-accented.

---

# Design System: PiLog

## 1. Overview

**Creative North Star: "The Reading-Room Journal"**

PiLog's surface is a quiet annotated page in a sunlit reading room. The neutrals are paper-warm and faintly ash-toned — not cream, not white, not zinc — and they should feel handled, not printed yesterday. The single accent is a quiet **forest moss**, the color a librarian might use for marginalia: present enough to find, never loud enough to interrupt. Type carries the weight a frame would in a SaaS dashboard: a literary serif for display, a humanist sans for the body, monospace for code and metadata. Motion is responsive — feedback exists, choreography does not.

The system explicitly rejects three patterns named in PRODUCT.md: **the generic AI-tool aesthetic** (purple/teal gradients, glassmorphism, gradient text, "✨ AI" garnish), **the SaaS-cliché dashboard** (hero-metric tiles, identical icon-heading-text card grids, side-stripe colored borders, friendly-rounded illustrations), and **the stock shadcn dashboard demo look** (default theme, Inter, zinc neutrals, blue accent — the path of least resistance). PiLog uses shadcn as a primitive layer; the visual identity is committed and recognizable on its own.

**Key Characteristics:**

- Paper-warm tinted neutrals; never `#fff`, never `#000`.
- Single moss-green accent, used on ≤10% of any given screen.
- Serif display + humanist sans body + monospace for code, paths, and note metadata.
- Flat by default; depth conveyed through tonal contrast, not shadow.
- Responsive motion only — every animation justifiable as feedback.
- Keyboard-first; focus rings visible and on-brand.
- Editor (CodeMirror/Milkdown) is the gravitational center of the scratchpad; UI chrome must defer to it.

## 2. Colors: The Reading-Room Palette

A paper-warm neutral field with a single moss accent. All values are committed at implementation; the canonical color space is OKLCH so neutrals stay even as lightness shifts and the moss reads true on calibrated and sRGB displays.

### Primary

- **Reading-Room Moss** (`oklch(48% 0.08 145°)` _[exact value to be resolved during implementation]_): the system's only saturated accent. Reserved for primary actions (Generate Drafts, Publish), focus rings, and active state on the rare element where state must read at a glance. **Not** used for decoration, not used on body text, not used to "add color" to empty surfaces.

### Neutral

The neutral ramp is the project's main visual surface. All steps are tinted toward warm yellow (~60° hue), low chroma (~0.005), so the page reads as paper rather than sterile gray.

- **Parchment** (lightest, `oklch(~96% 0.005 60°)` _[TBD at implementation]_): the default page surface and scratchpad canvas.
- **Ash** (one step darker): subtle surface separation — inbox row separators, settings group dividers, the "second card under the first" surface where unavoidable.
- **Pencil** (mid-range): supporting body text, metadata, file paths in mono.
- **Ink** (near-black, `oklch(~22% 0.02 60°)` warm-tinted): primary body text and headings. Never `#000`. The warm tint matters; it's what stops the system from reading clinical.

### Named Rules

**The One Voice Rule.** Reading-Room Moss appears on ≤10% of any given screen. Its rarity is the point. If two moss elements are visible at once, one of them is wrong.

**The Warm Neutral Rule.** No neutral in this system is pure gray. Every step has chroma ≥ 0.003 toward warm yellow. Pure `#000`, pure `#fff`, and untinted zinc/slate are prohibited.

**The Color-Independence Rule.** Status (`unprocessed` / `drafted` / `published` / `dismissed`), priority (`low` / `medium` / `high`), and confidence (`low` / `medium` / `high`) are never conveyed by hue alone. Every state carries a label, glyph, or shape signal alongside any color cue. This is non-negotiable; PRODUCT.md commits the system to colorblind safety at MVP.

## 3. Typography

**Display Font:** literary serif _[pairing to be chosen at implementation; candidates: Source Serif 4, Tiempos Text, Mercury, Spectral]_
**Body Font:** humanist sans _[pairing to be chosen at implementation; candidates: Söhne, Inter, IBM Plex Sans, Untitled Sans]_
**Code/Mono Font:** developer monospace _[pairing to be chosen at implementation; candidates: Berkeley Mono, JetBrains Mono, IBM Plex Mono, MD IO]_

**Character.** A literary serif gives PiLog the gravity of a thoughtful publication. The humanist sans keeps every list, label, and microcopy line legible at any size without going clinical. The monospace is editor-grade — chosen so reading code in note bodies, file paths in draft cards, and content in the CodeMirror/Milkdown editor all feel intentional rather than incidental.

### Hierarchy

_Exact sizes/weights resolved at implementation; ratios committed now._

- **Display** (serif, weight ~400, large clamp): inbox section titles, settings page headers, the rare scratchpad title. Sparingly used.
- **Headline** (serif, weight ~500, ~24–28px): draft card titles, modal/dialog headers.
- **Title** (sans, weight ~600, ~16–18px): UI section labels, settings group titles.
- **Body** (sans, weight ~400, ~14–15px, 1.55 line-height, **65–75ch max line length** in note rendering surfaces): primary reading text, draft descriptions, settings copy.
- **Label** (sans, weight ~500, ~12–13px, +0.02em letter-spacing, mixed-case never uppercase-everything): inputs labels, button text, microcopy.
- **Mono** (monospace, weight ~400, ~13–14px): note bodies in editor, file paths in affected-files lists, code blocks, agent run output. Never used decoratively.

### Named Rules

**The Hierarchy-Through-Type Rule.** Visual hierarchy comes from typeface, weight, and scale — not from background color, side-stripes, or boxed cards. If you're tempted to add a colored border to make a section stand out, change the type instead.

**The Editor-Gravitational Rule.** When the scratchpad is open, the monospace editor is the visual center. UI chrome (close button, save shortcut hint, repo selector) sits at the periphery, lower contrast than the editor body. The editor must never feel decorated.

**The No-Decorative-Type Rule.** No gradient text, no `background-clip: text`, no decorative all-caps tracking, no display weights below 200. Emphasis is weight or size, never effect.

## 4. Elevation

PiLog is **flat by default**. The visual system conveys depth through tonal layering on the warm-neutral ramp, not through shadow. Surfaces sit on top of each other by stepping the parchment-to-ash neutrals, not by floating with `box-shadow`.

Shadow exists only as a state response, never as a baseline. The scratchpad window is the lone exception — being a separate Electron window, it carries the OS's native window shadow, which is correct; do not add a CSS shadow on top.

### Shadow Vocabulary

_To be resolved at implementation. Three roles only:_

- **Hover lift** (very light, short offset): used on draft cards on hover only, signal that the card is interactive. Remove from `prefers-reduced-motion`.
- **Focus ring** (moss accent, 2px outline, 2px offset): keyboard focus on every interactive element. Always visible, never suppressed for aesthetics.
- **Active dialog** (medium ambient, large blur, near-zero offset): used only on the publish-confirmation dialog, where the surface genuinely lifts off the page.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state (hover, focus, active dialog). A static screenshot of any surface in its rest state contains zero `box-shadow`.

**The Tonal-Depth Rule.** When two surfaces need separation, the answer is tonal contrast on the warm-neutral ramp (Parchment over Ash, Ash over deeper Ash), not a shadow. Borders are 1px, low-contrast neutral; never a colored stripe.

## 5. Components

_No components implemented yet. Component primitives (Buttons, Inputs, Cards, Navigation, Scratchpad Editor, Draft Card, Source-Note Attribution, Inbox Row) will be documented on the next `$impeccable document` pass once shadcn primitives are themed and feature surfaces exist._

When component work begins, the scaffolds below are the first to capture in DESIGN.md, in this priority:

1. **Scratchpad Editor surface** — the signature component. Must feel like the system's reason for existing.
2. **Draft Card** — anchored visibly to its source notes; confidence and rationale always present, never collapsed by default.
3. **Inbox Row** — dense, scannable, keyboard-first; status conveyed by label + glyph + neutral tonal contrast (never hue alone).
4. **Buttons** (primary moss / ghost / destructive) — flat shape, paper-warm neutrals, no gradients, no glow.
5. **Inputs** — quiet stroke at rest, moss focus ring, no internal shadows.
6. **Settings Group** — a single Ash-on-Parchment surface with type-driven sectioning, not nested cards.

## 6. Do's and Don'ts

### Do:

- **Do** anchor color tokens in OKLCH so neutrals stay even and the moss reads true across displays.
- **Do** use Reading-Room Moss only for primary actions, focus rings, and necessary at-a-glance state. ≤10% of any screen.
- **Do** convey status, priority, and confidence with a label, glyph, _or_ shape alongside any color cue. The Color-Independence Rule is non-negotiable.
- **Do** lean on type, weight, and tonal neutrals for hierarchy. Headers earn their weight; backgrounds don't.
- **Do** respect `prefers-reduced-motion`. Reduced-motion users get instant transitions, never broken interactions.
- **Do** keep focus rings visible and on-brand. Use the moss accent at 2px outline + 2px offset.
- **Do** treat the CodeMirror/Milkdown editor as the gravitational center of the scratchpad. UI chrome defers.
- **Do** ship the warm neutral. Every neutral has chroma ≥ 0.003 toward warm yellow.
- **Do** keep body line length at 65–75ch in any reading-heavy surface (draft body, source notes, settings copy).

### Don't:

- **Don't** ship the **generic AI-tool aesthetic** named in PRODUCT.md: no purple/teal gradients, no glassmorphic cards, no gradient text, no "✨ AI" badges, no shimmer, no wand icons, no "magic" copy.
- **Don't** ship the **SaaS-cliché dashboard** named in PRODUCT.md: no hero-metric template (big number / small label / supporting stats / gradient accent), no identical icon-heading-text card grids, no friendly-rounded illustrations, no decorative blurs.
- **Don't** ship the **stock shadcn dashboard demo look** named in PRODUCT.md: default shadcn theme + Inter + zinc neutrals + blue accent are the failure mode this design exists to refuse.
- **Don't** use `#000` or `#fff` anywhere. Pure neutrals are prohibited.
- **Don't** use side-stripe borders. `border-left` / `border-right` greater than 1px as a colored accent on cards, list items, callouts, or alerts is prohibited.
- **Don't** use `background-clip: text` for gradient text. Single solid color, emphasis via weight or size.
- **Don't** reach for a modal as the first thought. Inline and progressive disclosure first; modal only when the action genuinely takes the user out of the current task (publish-confirmation is the canonical case).
- **Don't** nest cards. A card inside a card is always wrong.
- **Don't** wrap everything in a container. Most surfaces don't need one.
- **Don't** animate CSS layout properties (`width`, `height`, `top`, `left`, `margin`). Transform, opacity, and color only.
- **Don't** suppress focus rings for aesthetics. The keyboard-first promise is honored visibly.
- **Don't** use color alone for status, priority, or confidence — ever.
- **Don't** add a second accent because "the page feels empty." Empty is the design.
