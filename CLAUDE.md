# pilog

Electron desktop app. See `README.md` and `docs/pilog_prd.md` for product context.

## Agent skills

### Issue tracker

Issues live in GitHub Issues at `nick-neely/pilog`, accessed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Design context

Before any UI work, read `PRODUCT.md` and `DESIGN.md` at the repo root. They define the strategic and visual lines for PiLog and are the source of truth for the `$impeccable` skill.

- **Register:** `product`. App UI serves the capture/triage workflow; no marketing surface in MVP.
- **Personality:** warm, crafted, calm — a developer's bedside journal. References: iA Writer, Things 3, Bear.
- **North Star:** _The Reading-Room Journal_ — paper-warm tinted neutrals + a single Reading-Room Moss accent (`oklch(48% 0.08 145°)`) used on ≤10% of any screen.
- **Type:** Source Serif 4 (display) + IBM Plex Sans (body) + IBM Plex Mono (code, paths, editor body). Wired in `src/renderer/src/assets/main.css` as `--font-heading`, `--font-sans`, `--font-mono`.
- **Motion:** responsive (feedback only, no choreography); `prefers-reduced-motion` respected strictly.
- **Elevation:** flat by default; depth via tonal contrast on the warm-neutral ramp.
- **Anti-references (hard nos):** generic AI-tool aesthetic (purple/teal gradients, glassmorphism, gradient text, "✨ AI"), SaaS-cliché dashboards (hero-metric tiles, identical card grids, side-stripe borders), the stock shadcn dashboard demo look (default theme + Inter + zinc + blue).
- **Accessibility:** WCAG 2.2 AA, keyboard parity, color independence for status/priority/confidence, on-brand visible focus rings.

`DESIGN.md` is now live (no longer a seed). Tokens are wired in `src/renderer/src/assets/main.css` (`:root` light, `.dark` dark) and the `.impeccable/design.json` sidecar holds tonal ramps, narrative, and the rendered button/alert-dialog component snippets. Re-run `$impeccable document` whenever new themed primitives land (Input, Inbox Row, Draft Card, Scratchpad Editor, Settings Group) so the spec keeps pace with the code.
