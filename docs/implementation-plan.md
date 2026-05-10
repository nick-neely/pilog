# PiLog Implementation Plan

This document is the **source of truth for sequencing PiLog MVP work**. It complements `docs/pilog_prd.md` (the _what_) by making the _how_ and _in what order_ explicit. As phases land, each completed item should be checked off here and reflected in `CONTEXT.md` / `docs/adr/`.

> **Status legend:** ☐ not started · ◐ in progress · ☑ done

---

## 0. Operating Principles

These hold across every phase.

1. **Vertical slices over horizontal layers.** Prefer "I can capture a note end-to-end" over "I have a complete DB layer." Each phase ships a coherent user experience, even if narrow.
2. **Main process owns the truth.** GitHub, DB, Pi runtime, file system, and secrets live in the Electron main process. Renderer talks to them only through typed IPC.
3. **Typed IPC contract.** All IPC channels are defined in a single `src/shared/` module imported by main, preload, and renderer. Renderer never sees `ipcRenderer` directly.
4. **One ADR per load-bearing decision.** When a choice is hard to reverse (DB engine, window architecture, agent embedding strategy, secret storage), write an ADR before committing the code that depends on it. See `docs/agents/domain.md`.
5. **Issues track work; this doc tracks shape.** Once a phase is decomposed, ship the issue list to `nick-neely/pilog` via the `to-issues` skill. Don't grow this doc into a ticket tracker.
6. **Local-first, BYOK.** Nothing leaves the machine until the user explicitly publishes. No telemetry in MVP.

---

## 1. Cross-Cutting Concerns

Set up once; reused by every phase.

### 1.1 Tooling baseline (Phase 1, week 1)

- Tailwind CSS + `shadcn/ui` (component pattern, not a runtime dep).
- HugeIcons React (`@hugeicons/react` + `@hugeicons/core-free-icons`) for icons.
- Path aliases: `@main/*`, `@preload/*`, `@renderer/*`, `@shared/*`.
- ESLint + Prettier already present; extend rules for React/TS hygiene.

### 1.2 Testing (Phase 1, week 1)

- **Vitest** for unit tests (note repository, IPC handlers, agent JSON parsing).
- **Playwright** + `@playwright/test` driving the packaged Electron build for end-to-end smoke (`launch app → press hotkey → write note → see it in inbox after restart`).
- CI is out of scope for MVP, but tests must run locally with one command (`pnpm test`).

### 1.3 Domain docs (Phase 1, week 1)

- Create `CONTEXT.md` defining: **Note**, **Inbox**, **Repo**, **Issue Draft**, **Agent Run**, **Publish Log**, **Scratchpad**, **Review Mode**, **Auto-Publish Mode**.
- Initial ADRs to write in Phase 1:
  - **ADR-0001** Local persistence: better-sqlite3 + Drizzle (vs. libSQL/Turso, vs. JSON file).
  - **ADR-0002** Window architecture: hybrid tray + opt-in main window; scratchpad as a separate `BrowserWindow`.
  - **ADR-0003** IPC contract: shared TypeScript types + thin handler registry (vs. tRPC over IPC, vs. ad-hoc channels).
- Add ADRs in later phases as decisions surface (Pi embedding, GitHub auth flow, etc.).

### 1.4 Logging & errors

- Tiny structured logger in `src/main/lib/log.ts` writing to `app.getPath('logs')/pilog.log`.
- All IPC handlers wrap their work in a `Result<T>` union so renderer toasts never see raw stack traces.

### 1.5 Secrets

- `safeStorage` (Electron) for GitHub tokens. Wrapped behind `src/main/security/secrets.ts`.
- DB never stores tokens or model API keys. ADR if/when we deviate.

---

## 2. Phase Roadmap (at a glance)

| Phase | Theme                       | User-visible outcome                                                     | Status |
| ----- | --------------------------- | ------------------------------------------------------------------------ | :----: |
| 1     | Desktop shell + local notes | Hotkey → scratchpad → inbox; persists across restarts                    |   ☑    |
| 2     | GitHub + repo setup         | Connect GitHub, link a local repo, manually create a test issue          |   ☑    |
| 3     | Pi agent runtime            | Selected notes + repo path → structured `IssueDraft` JSON stored locally |   ☑    |
| 4     | Review mode                 | Draft cards: edit, split, merge, dismiss, publish to GitHub              |   ☑    |
| 5     | Auto-publish mode           | One click: generate + publish, with safety rails and a publish report    |   ☑    |
| 6     | 1.0 polish                  | Template-aware drafts, label matching, onboarding, packaging, updates    |   ☐    |

Phase boundaries are _demoable_. Each ends with something a user could touch.

---

## 3. Phase 1 — Desktop Shell and Local Notes

**Goal:** A dev can press a global hotkey from anywhere, dump rough markdown into a small floating scratchpad, close it, and find that note in an inbox window — even after restarting the app. Nothing else.

This is the most plumbing-heavy phase. We resist the urge to also wire GitHub or Pi here; both come next and depend on the foundation we lay.

### 3.1 Sub-phase 1A — Foundations (invisible plumbing)

Order matters: 1A → 1B → 1C. Each can be a standalone PR.

- ☑ **Tooling**
  - Add Tailwind + PostCSS config for `electron-vite`'s renderer.
  - `pnpm dlx shadcn@latest init` → write components into `src/renderer/src/components/ui/`.
  - HugeIcons React.
  - Add path aliases in `tsconfig.*` and `electron.vite.config.ts`.
- ☑ **Project structure** — refactor `src/main/index.ts` from the boilerplate single-file form into the layout in PRD §7:
  ```
  src/
    main/{window,hotkeys,db,ipc,lib,security}/
    preload/{index.ts,api.ts}
    renderer/src/{features,components,lib,hooks}/
    shared/{ipc.ts,types.ts}
  ```
  Keep the file moves mechanical; no behavior change.
- ☑ **DB layer**
  - Add `better-sqlite3`, `drizzle-orm`, `drizzle-kit`.
  - `drizzle.config.ts` pointing migrations at `drizzle/migrations/`.
  - Schema (define everything we'll need through Phase 4 — cheap now, painful to migrate later):
    - `notes` (id, repoId?, content, status, createdAt, updatedAt)
    - `repos` (id, name, owner, localPath, githubUrl?, defaultBranch?, autoPublishEnabled, createdAt, updatedAt)
    - `issue_drafts` (per PRD §11 plus `groupingReason`, `confidence`, `status`)
    - `agent_runs` (id, status, inputNoteIds JSON, outputDraftIds JSON, startedAt, finishedAt, errorMessage?)
    - `publish_log` (id, draftId, githubIssueUrl, publishedAt, repoId)
  - Database lives at `app.getPath('userData')/pilog.sqlite`. Run pending migrations on app start.
  - Note repository module: `createNote`, `updateNote`, `deleteNote`, `listNotes({status, repoId, search})`.
- ☑ **IPC contract**
  - `src/shared/ipc.ts` exports a `Channels` const and request/response types per channel.
  - `src/main/ipc/registry.ts` registers handlers and enforces typing.
  - `src/preload/api.ts` exposes a single `window.pilog` object — no raw `ipcRenderer`.
  - Update `src/preload/index.d.ts` so renderer gets autocomplete on `window.pilog`.
- ☑ **Window manager** — `src/main/window/` with `createMainWindow`, `createScratchpadWindow`, plus a small `WindowRegistry` so we can show/focus instead of recreating.
- ☑ **Tray** — system tray with: _Open Inbox_, _New Note_ (focuses scratchpad), _Settings_, _Quit_. (Hybrid mode per ADR-0002.)
- ☑ **Domain docs** — write `CONTEXT.md` + ADR-0001/0002/0003.
- ☑ **Tests (foundation)** — Vitest config; unit tests for note repository CRUD against an in-memory better-sqlite3 instance.

### 3.2 Sub-phase 1B — Capture (the scratchpad)

- ☑ **Global hotkey** — register `CommandOrControl+Alt+N` on app ready; deregister on quit. Read user override from a new `settings` row (key/value table).
- ☑ **Scratchpad window**
  - Frameless, always-on-top, 480×360, centered to active screen.
  - Single CodeMirror 6 instance configured for markdown. No menus, no chrome.
  - `Esc` → save and hide; `Cmd/Ctrl+Enter` → save and hide; `Cmd/Ctrl+S` → save and stay open.
  - Save logic: if the buffer is non-empty and changed, INSERT a new note with `status = 'unprocessed'`. Closing without changes is a no-op.
  - On reopen, the scratchpad starts empty (it's a _capture_ surface, not a doc editor).
- ☑ **Tests (1B)** — Playwright: launch → trigger hotkey via app menu (Playwright can't synthesize global hotkeys, so wire a debug menu item that calls the same code path) → type → close → assert DB row exists.

### 3.3 Sub-phase 1C — Triage surface (the inbox)

- ☑ **Inbox screen** in the main window:
  - Virtualized list of notes (most recent first).
  - Status filter chips: _Unprocessed / Drafted / Published / Dismissed_.
  - Free-text search (SQLite `LIKE` on content for MVP; FTS later if needed).
  - Multi-select with Shift/Cmd; bulk actions stub buttons (_Generate Drafts_, _Dismiss_) wired but disabled until Phase 3/4.
  - Detail pane: edit raw markdown of a note (CodeMirror again), save, delete.
- ☑ **Settings screen (skeleton)** — just the hotkey input and "Open inbox at login" toggle for now. Wire `app.setLoginItemSettings`.
- ☑ **Tests (1C)** — Playwright e2e: launch → open scratchpad via menu → type two notes → close scratchpad → see both notes in inbox → restart app → still there.

### 3.4 Phase 1 acceptance criteria

A reviewer can verify each of:

1. ☑ Cold start to inbox visible: < 1.5 s on a typical laptop.
2. ☑ Hotkey press to scratchpad focused & ready to type: < 200 ms after first invocation.
3. ☑ Notes survive a hard kill (`pkill electron`) and a clean quit.
4. ☑ `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm test:e2e` all green.
5. ☑ `CONTEXT.md` defines every term used in Phase 1 code.
6. ☑ ADR-0001/0002/0003 exist and reflect the implementation.
7. ☑ No GitHub or Pi code committed (those come in Phase 2/3 — keep boundaries clean).

### 3.5 Phase 1 explicit non-goals

- No GitHub auth, no repo selection that does anything, no Pi runtime, no draft generation.
- No tagging or repo association on notes (the column exists; the UI doesn't).
- No keyboard shortcuts beyond the hotkey, save, and close.
- No dark/light theme polish — system default is fine.
- No app icon polish, no installer signing.

---

## 4. Phase 2 — GitHub and Repo Setup

**Goal:** Connect a GitHub account, register a local repo, and create a hand-written test issue from inside PiLog. Notes can now be tagged with a repo.

- ☑ **Auth** — GitHub OAuth via local-loopback callback (preferred over device flow for desktop UX). Token stored via `safeStorage`. Rotation/sign-out flow. _ADR-0004._ (#7)
- ☑ **GitHub client** — Octokit wrapper with retry + rate-limit awareness; thin functions: `listRepos`, `listLabels(repo)`, `getIssueTemplates(repo)`, `createIssue(repo, payload)`.
- ☑ **Repo registration** — UI to pick a local directory; detect git via `simple-git` (read `.git/config` remote, default branch, current HEAD). Match to a GitHub repo. Persist to `repos`. (#8)
- ☑ **Scratchpad repo selector** — inline picker that defaults to last-used or detected-from-CWD. (#9)
- ☑ **Notes ↔ repo association** — column already exists; surface filter and edit affordance in inbox. (#9)
- ☑ **Manual issue compose** — a "New Issue" button on a repo that opens a form (title/body/labels), posts via the GitHub client, writes a `publish_log` row, opens the issue URL. (#10)
- ☑ **Tests** — mocked Octokit unit tests; Playwright e2e against a sandbox repo (skipped in CI without a token; documented).

### Phase 2 acceptance

User can connect GitHub, link a real repo, type a title/body, and see the issue appear on github.com — without ever touching the browser themselves.

---

## 5. Phase 3 — Integrated Pi Agent Runtime

**Goal:** Select notes + a linked repo → click a button → get structured `IssueDraft` JSON written to `issue_drafts`. No publishing yet; review UI is Phase 4.

- ☑ **Embedding strategy** — resolved in [ADR-0005](./adr/0005-pi-embedding-strategy.md): in-process `pi-agent-core` + `pi-ai`, exit-tool pattern, `safeStorage`-backed `AuthStorage`, `MessagePortMain` streaming, curated read-only tool set.
- ☑ **Pi runtime bridge** — `src/main/pi/runtime.ts` implements `runAgent(input): AsyncIterable<AgentEvent>` per ADR-0005 §1–4. Preload consumes the `MessagePortMain` stream and exposes a cloneable `window.pilog.runAgent(input, onEvent): Promise<void>` renderer API.
- ☑ **Pi config UX** — `Settings → Provider & Model`. Surfaces Pi's BYOK flow inside PiLog (PRD §7 BYOK). "Open advanced config" escape hatch.
- ☑ **Issue generation** — `src/main/pi/issue-generation.ts` constructs the prompt per PRD §15, supplies repo path + selected notes, validates output against the `GeneratedIssueDraft` Zod schema (PRD §10), persists to `issue_drafts`.
- ☑ **Agent runs view** — minimal list of past runs with input/output/error, useful for debugging prompts.
- ☑ **Inbox button wires up** — _Generate Draft Issues_ now does something for selected notes.
- ☑ **Tests** — unit tests for prompt assembly and JSON validation (using fixture LLM responses); integration test runs the agent against a tiny fixture repo.

### Phase 3 acceptance

☑ 5 rough notes about a real local repo → 1–3 drafts visible in the DB, each with non-empty `affectedFiles`, `acceptanceCriteria`, and a non-trivial `groupingReason`.

---

## 6. Phase 4 — Review Mode

**Goal:** Drafts become first-class. User can edit them, split/merge, dismiss, or publish to GitHub.

- ☑ **Draft review screen** — card per draft with the fields from PRD §9.5; inline editing of title/body/labels/acceptance criteria.
- ☑ **Source notes panel** — show every note that fed this draft; clicking opens the note.
- ☑ **Affected files panel** — clickable; opens in OS file explorer or copies path. (No in-app file viewer in MVP.)
- ☑ **Split / merge** — split duplicates the draft and lets the user move sourceNoteIds; merge combines two drafts (concat bodies, union of labels and notes).
- ☑ **Publish** — uses Phase 2's `createIssue`. On success, mark draft `published`, write `publish_log`, mark source notes `published`.
- ☑ **Empty/error states** — no drafts yet, agent run failed, GitHub returned 422, etc.
- ☑ **Tests** — Playwright e2e: from raw notes → draft → edit → publish → assert issue URL stored.

### Phase 4 acceptance

☑ Full happy path of PRD Flow 2 works end-to-end against a real GitHub repo.

---

## 7. Phase 5 — Auto-Publish Mode

**Goal:** One-click "generate and publish" with safety rails per PRD §8 Flow 3 + §9.7.

- ☑ **Per-repo toggle** + max-issues-per-run, default label `triaged-by-pilog`, dry-run flag, and confirmation requirement. Implemented by #30.
- ☑ **Generate and Publish preview** showing planned drafts before any GitHub writes, with max-issue limiting, default-label application, and dry-run no-op behavior. Implemented by #31.
- ☑ **Confirmed auto-publish** that creates GitHub issues, keeps successful local state, reports failures, and does not roll back already-created issues on partial failure. Implemented by #32.
- ☑ **Current inbox batch entry point** for one repo's eligible unprocessed notes, reusing the same preview/publish/report path. Implemented by #33.
- ☑ **Local audit log** view backed by `publish_log`, covering both manual Review Mode publishes and Auto-Publish Mode publishes. Implemented by #34.
- ☑ **Tests** — unit and e2e coverage exists for guardrail defaults/persistence, preview/dry-run planning, partial publish failure, current inbox selection, and publish-log behavior.

### Phase 5 acceptance

☑ PRD §13 success criterion _"Auto-publish works but is clearly controlled and auditable"_ is demonstrably true.

---

## 8. Phase 6 — 1.0 Polish

**Goal:** Hand the app to someone who has not seen it. They can understand the first-run path, generate GitHub-native issue content, and install/update a credible desktop build without asking a question.

### 8.1 GitHub-native draft quality

- ☐ **Issue-template awareness** — read repo issue templates when available and use the chosen/default template as scaffolding for generated drafts and manual compose. Tracked by #35.
- ☐ **Repo label matching** — fetch existing labels for the linked repo, normalize generated label suggestions against that set, and make invented labels explicit instead of silently sending them. Tracked by #36.
- ◐ **Prompt tuning loop** — fixture response tests already cover grouping, splitting, parent/subtask, single-draft, and clarification shapes; Phase 6 needs fixture repos and repeatable quality checks that exercise real repo tools, templates, and labels. Tracked by #37.

### 8.2 First-run and cross-app states

- ◐ **Loading / error / empty states across the app** — core Inbox, Draft Review, Agent Runs, Settings, Repositories, auto-publish, and Publish Log states exist, but the app still needs a complete pass for consistency, recovery actions, and accessible wording. Tracked by #39.
- ☐ **Onboarding flow** — first launch should guide the user through hotkey, GitHub auth, first linked repo, first note, first draft, and first publish without leaving the app. Tracked by #38.
- ☐ **Packaged runtime readiness** — verify packaged builds can run Pi, `@vscode/ripgrep`, `better-sqlite3`, OAuth callback, safeStorage, and e2e smoke paths outside dev. Tracked by #40.

### 8.3 Distribution and updates

- ◐ **App icon, tray icon, and packaging** — resources and `electron-builder` targets exist, but metadata still uses boilerplate values and signing/notarization/distribution scope is unresolved. Tracked by #40.
- ☐ **App update channel** — `electron-updater` is installed and `dev-app-update.yml` exists, but the real provider URL, update checks, and user-facing update states are not implemented. Tracked by #41.

### Phase 6 acceptance

1. ☐ A new user can complete onboarding through a published issue without direct coaching.
2. ☐ Generated drafts respect repo issue templates and label vocabulary.
3. ☐ Errors across auth, repo selection, Pi configuration, generation, publishing, and update checks explain the recovery action.
4. ☐ At least one unpacked desktop build is smoke-tested end-to-end, and signed/distribution decisions are documented.

---

## 9. Tracking and Handoff

Phase 6 is now the next real phase. Use `to-issues` against §8 and publish thin vertical slices to `nick-neely/pilog` with the `needs-triage` label. Each issue should reference the relevant §8 subsection and include enough acceptance criteria to be independently verifiable.

---

## 10. Open Questions to Resolve in Flight

Carried from PRD §16, with assigned phase:

- ☑ **Pi embedding strategy** — resolved in [ADR-0005](./adr/0005-pi-embedding-strategy.md). PiLog embeds Pi in-process via `pi-agent-core` + `pi-ai`, with a `safeStorage`-backed `AuthStorage`, `MessagePortMain` streaming, and a curated read-only tool set. No spike branch — the architecture was decided through documentation review and grilling against the existing domain model; empirical guards land as first-pass acceptance criteria on #12.
- ☑ **Repo indexing: persistent vs. per-run** — resolved as per-run repository tools for MVP. The agent has bounded read-only `read_file`, `glob`, `grep`, and git-context tools; persistent indexing remains future work only if latency or quality data demands it.
- **Issue-template parsing in MVP** — Phase 6 work, now imminent.
- ☑ **Auto-publish behind "advanced" toggle** — resolved by #30. Auto-publish is explicit, repo-scoped configuration in the Repositories surface, not a hidden global advanced mode.
- **Multi-scratchpad vs. single inbox** — single inbox in MVP; revisit only if user feedback demands it.

Remaining 1.0 questions:

- macOS code-signing & notarization scope for MVP — affects whether Playwright e2e tests run against a packaged or unpacked app.
- Should the inbox window remember its size/position across launches? (Default: yes, via `electron-window-state`.)
- ☑ **Settings storage** — resolved as the `settings` key/value table, not a JSON file in `userData`.
