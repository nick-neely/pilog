# PiLog

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

## UI/UX skill routing

Use skills to keep implementation aligned with PiLog’s design system and shadcn discipline.

- **Before any UI/UX work** (renderer components, layout, typography, microcopy, visual hierarchy, accessibility, settings/onboarding/empty states, tokens, or themed primitives): invoke `/impeccable` and follow its setup. If slash commands or skills are unavailable in your harness, read `PRODUCT.md` and `DESIGN.md` end to end and apply the same constraints (Reading-Room Journal, anti-references, WCAG 2.2 AA, keyboard parity).
- **When touching shadcn/ui** (adding, changing, debugging, or composing primitives under `src/renderer/src/components/ui/` or imports from `@renderer/components/ui`): invoke `/shadcn`. Prefer existing primitives; add missing ones with `pnpm dlx shadcn@latest add <component>` (this repo uses pnpm). After `add`, read the generated files and fix imports, icon library (HugeIcons only), and composition before shipping.
- **Sandcastle (Claude):** the driver mounts host `~/.claude/skills` at `/home/agent/.claude/skills` so Claude Code can resolve those skills in-container. Ensure that directory exists on the machine that runs Sandcastle.

## Learned User Preferences

- Prefer incremental polish over a full UI redesign when feedback is localized to one surface (for example the Repositories New Issue dialog).
- For sidebar and status-filter polish across Inbox, Runs, and Drafts, treat Inbox as the default visual standard unless the user specifies otherwise.
- Status filters across Inbox, Runs, and Drafts should be clearable; the cleared state shows all statuses instead of forcing a default selection.
- For contextual help or secondary detail in dialogs and sidebars, prefer a compact info-icon hover card (like the Inbox Generate Drafts footer) over large inline disclosures.
- Avoid em dashes in marketing site copy.

## Learned Workspace Facts

- For impeccable design context, run `node .claude/skills/impeccable/scripts/context.mjs` (or the equivalent under `.agents/` / `.cursor/`); if context is missing, read `PRODUCT.md` and `DESIGN.md` at the repo root.
- ESLint and Prettier exclude `.agents/`, `.claude/`, and `.cursor/` harness skill trees from lint/format checks (`eslint.config.mjs` ignores, `.prettierignore`).
- `.cursor/hooks/state/` is listed in `.gitignore`; hook state and continual-learning index files stay local and are not committed by default.
- The shared `Note` type includes `runId: string | null`; main-process mapping from SQLite and test fixtures that construct `Note` values must include `runId` (from `run_id` or `null`).
- The `.sandcastle/Dockerfile` image is a long-lived sandbox (`sleep infinity`); typical workflow is build, run with the repo mounted at `/home/agent/workspace`, then use `docker exec` for a shell (unless Sandcastle CLI drives mounts for you). Sandcastle’s ready hook runs `CI=true PILOG_SANDBOX=1 pnpm install`, which skips `app:rebuild` (avoids flaky `electronjs.org` fetches during `electron-rebuild`). Normal install on the host or for e2e should not rely on `PILOG_SANDBOX` alone: run a full install/rebuild (`pnpm install` without that flag or `pnpm run app:install` / `app:rebuild`) so `better-sqlite3` matches Electron’s ABI. Vitest uses Node’s native module ABI; if `better-sqlite3` was built only for Electron, local tests can fail with a `NODE_MODULE_VERSION` mismatch until you rebuild under the same Node that runs Vitest.
- In `src/shared/ipc.ts`, optional invoke payloads should be modeled as `T | undefined`, not `T | void`, so handlers line up with optional repository arguments and IDE TypeScript agrees with CLI checks.
- `PILOG_BUNDLED_GITHUB_CLIENT_ID` is the GitHub OAuth app Client ID for packaged device-flow builds; local dev can use `GITHUB_CLIENT_ID`, and client secrets only belong to the optional loopback flow.
- `SANDCASTLE_MAX_PARALLEL_ISSUES` caps the number of issues emitted by one planner result; if the planner returns one issue, Sandcastle runs one issue even when the cap is higher. Sandcastle dependency ordering is inferred from issue body text returned by `gh issue list`; use explicit sections like `Blocked by` / `Blocks` because GitHub native parent relationships are not validated by the runner.
- In renderer UI, prefer shadcn/Radix `Tooltip` over native `title` attributes for controls so the app avoids double tooltips and keeps styled accessible hints.
- `scripts/site-metadata.test.ts` (and similar) should derive expected download `softwareVersion` / `releaseNotes` from `site/src/data/release-manifest.json` using the same `stable ?? preview` rule as `site/src/lib/metadata.ts`, not hardcoded preview version strings.
- Root `pnpm run verify` runs typecheck, lint, and test in parallel via `concurrently`.
- Preview release Git tags must use the `v` prefix and match `vX.Y.Z-preview.N` (e.g. `v0.0.1-preview.10`); the Release — Preview workflow validates this format.
