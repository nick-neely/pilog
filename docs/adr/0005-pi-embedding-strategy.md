# ADR 0005: Pi Embedding Strategy

## Status

Accepted (2026-05-08)

## Context

PiLog's MVP depends on a local AI agent that reads selected notes and the active repo, then returns structured GitHub-issue drafts. PRD §7 designates **Pi** as that runtime — specifically the open-source TypeScript agent framework at [`earendil-works/pi`](https://github.com/earendil-works/pi), comprising:

- `@earendil-works/pi-agent-core` — the raw `Agent` loop (turn-by-turn LLM completion, tool dispatch, event emission)
- `@earendil-works/pi-ai` — the unified multi-provider LLM API (`getModel`, `complete`) and OAuth-token refresh
- `@earendil-works/pi-coding-agent` — the higher-level SDK that drives the `pi` CLI, including `AuthStorage`, `ModelRegistry`, an interactive coding system prompt, and a full edit/glob/grep/bash tool set

Issue #11 originally framed the choice as "(a) package/runtime embedding vs. (b) managed binary/CLI with install/update/health checks." That framing is incorrect: Pi is distributed as Node.js packages with a `bin/pi` entry point, not a per-platform native binary. The real axes of the decision are (1) process boundary, (2) which Pi layer to consume, (3) where credentials live, (4) how streaming reaches the renderer, (5) what tools the agent can call, plus packaging and update-channel mechanics that fall out of those.

This ADR fixes those axes so Phase 3 work (#12–#15) has a stable target.

## Decision

PiLog embeds Pi as a **library imported in-process into the Electron main process**, layered on `pi-agent-core` + `pi-ai`, with a `safeStorage`-backed implementation of Pi's `AuthStorage` interface, `MessagePortMain`-based streaming to the renderer, and a curated read-only tool set.

The decision has eight components.

### 1. Process boundary: in-process

Pi's `Agent` is constructed and driven inside `src/main/pi/runtime.ts`, in the same Node context as DB writes and IPC handlers. No child process, no JSON-RPC over stdio.

Rationale:
- `pi-agent-core` is pure JavaScript, HTTP-bound, and has no native dependencies that would force an Electron native rebuild. The classic "different runtime" reason for child-process isolation does not apply.
- Issue #12's contract `runAgent(input): AsyncIterable<AgentEvent>` maps 1:1 onto Pi's `agent.subscribe(callback)`. Going through stdio JSON-RPC would add a serialize/parse layer for no behavioral gain.
- BYOK secret hygiene is _easier_ in-process: the API key lives in main's heap and is handed to Pi as a function return. Out-of-process means env vars (visible in `/proc/<pid>/environ`), a config file (a new credential-on-disk problem), or a credential-request RPC (more complexity).
- Cancellation via `agent.abort()` is a synchronous in-process signal; over RPC it is an extra round-trip.

The accepted cost is reduced crash isolation: a Pi-side fault that escapes its event/error model can take down the main process. Given that Pi is pure JS over HTTP, catastrophic faults (OOM, native segfault) are very unlikely. We document this and revisit only if it bites in practice.

The first implementation pass must verify, with a snapshot before/after a real run, that Pi does not mutate `process.cwd`, `process.env`, signal handlers, or `process.exit`. If it does, we revisit this section.

### 2. Pi layer: `pi-agent-core` + `pi-ai`, not the coding-agent SDK

PiLog imports `Agent` and `AgentLoopConfig` from `@earendil-works/pi-agent-core` and `getModel`/`complete` from `@earendil-works/pi-ai`. We do **not** import the coding-agent SDK's session, prompt, or tool set.

Structured output uses the **exit-tool pattern**: PiLog registers a tool named `submit_issue_drafts` whose parameters carry the `GeneratedIssueDraft[]` schema from PRD §10 verbatim. Pi enforces the parameter schema (TypeBox) at call time, so the agent literally cannot emit off-schema output that reaches persistence. The first call to `submit_issue_drafts` is the run's result; the agent loop terminates after that turn.

Rationale:
- The exit-tool contract collapses validation: Pi's parameter check and PiLog's persistence-side Zod check are the same schema, applied once.
- The agent is **read-only by construction** — it has no write/edit/exec/network tools, so prompt-injected note content cannot escape the curated tool set. This is a real security property, not prompt discipline. The coding-agent SDK ships `edit`/`write`/`bash` and a system prompt assuming they exist; we would be working against its grain.
- PRD §15's prompt is a triage prompt, not a coding-agent prompt. Writing it fresh on `pi-agent-core` is straightforward; adapting it on top of the coding-agent's session prompt is a guessing game about residual coding-agent behavior.
- Auto-compaction, auto-retry, and session resume — the coding-agent SDK's main extras — do not benefit our one-shot, short-context, ephemeral runs.

The first implementation pass must verify that calling the exit tool actually terminates the loop in `pi-agent-core` (assertion: exactly one call, `agent_end` fires after, no further turns). If it does not, the bridge layer aborts the loop manually after capturing the call's args; either way the contract holds.

### 3. BYOK: reuse Pi's `AuthStorage` interface, supply a `safeStorage` backend

PiLog reuses Pi's credential-and-catalog primitives:
- `AuthStorage` (interface) — exposed by `@earendil-works/pi-coding-agent`; PiLog supplies its own implementation
- `ModelRegistry` (`getApiKeyAndHeaders`, `getAll`, `find`) — used as-is
- `getOAuthApiKey` from `@earendil-works/pi-ai/oauth` — used as-is, never reimplemented

The only PiLog-owned credential code is **`SafeStorageAuthStorage`** at `src/main/pi/auth-storage.ts`: a class implementing the `AuthStorage` interface against `safeStorage.encryptString` / `decryptString` over per-provider blob files at `app.getPath('userData')/pi-auth/<provider>.bin`.

PiLog **never** reads or writes `~/.pi/agent/auth.json`. A one-time **import-from-existing-Pi** affordance is acceptable in #13 but is not required for MVP.

OAuth is deferred to post-MVP — only API-key flows are surfaced in MVP Settings UI. The `AuthStorage` interface still requires `setOAuthCredential`/`getOAuthCredential` methods, which are implemented from day one. Adding OAuth post-MVP is therefore a Settings-flow slice (browser launch + loopback + `setOAuthCredential` call), not a credential-layer rewrite.

Rationale:
- PRD §7 requires OS credential storage. Pi's default `~/.pi/agent/auth.json` is 0600 plaintext — better than the DB but worse than `safeStorage`. Adopting `safeStorage` aligns Pi credentials with the GitHub token that already lives there per ADR-0004.
- Sharing `auth.json` with a user's standalone `pi` install introduces two writers on one file and a UX confound ("why did my token disappear?"). PiLog owns its own credential lifecycle.
- The reinvention surface is small: ~60 lines of storage-method bodies. Provider catalog, model catalog, OAuth refresh, and `getApiKeyAndHeaders` semantics all stay in Pi.

The first implementation pass must verify that `ModelRegistry` accepts a custom `AuthStorage` instance (constructor injection) rather than only `discoverAuthStorage()`. If it does not, PiLog subclasses the concrete `AuthStorage` and overrides only the persistence methods.

### 4. Streaming: `MessagePortMain` per invocation, plus invalidation broadcast

PiLog uses two distinct IPC primitives.

**Per-invocation agent stream — `MessagePortMain`.** On `pi:generateDrafts:start`, main creates a `MessageChannelMain`, returns the `runId` to the caller via the normal `IpcContract` request/response, and posts the renderer-side port via `webContents.postMessage('pi:agent-stream', { runId }, [port])`. Preload listens for that channel, wraps each received port in a typed AsyncIterable, and exposes `window.pilog.runAgent(input): AsyncIterable<AgentEvent>` to the renderer. The iterator's lifetime equals the port's; closing the port (on `agent_end`, error, or cancel) ends the renderer's `for await`.

**Cross-window invalidation — `webContents.send`.** When any agent-runs row changes status, main broadcasts `agent-runs:invalidated` to all open `BrowserWindow`s. The Agent Runs list (issue #15) re-fetches on receipt. This is intentionally one-bit; the runs view does not subscribe to its own per-run stream in MVP.

**Event projection.** Pi's native event stream (`agent_start`, `message_update[text_delta|thinking_delta]`, `tool_execution_start|update|end`, `turn_start|end`, `compaction_*`, `auto_retry_*`, `queue_update`, `agent_end`) is captured **in full** for persistence into `agent_runs` (powers issue #15's debug surface). It is **deliberately projected** into a coarser `AgentEvent` discriminated union for the renderer:

```ts
type AgentEvent =
  | { type: 'progress'; phase: string }                  // collapses turn_start, tool_execution_start, etc.
  | { type: 'partial'; text: string }                    // optional message_update text deltas
  | { type: 'final'; drafts: GeneratedIssueDraft[] }     // emitted on submit_issue_drafts tool call
  | { type: 'error'; message: string; cause: ErrorCause }
```

`AgentEvent` is the renderer-facing contract; Pi's full stream is the persistence-facing one. They are distinct on purpose.

Rationale:
- `MessagePortMain` provides per-run lifecycle natively (port close = run done) and maps cleanly onto AsyncIterable. The alternative (`webContents.send` channels keyed by `runId`) requires manual subscription bookkeeping in main and `runId` demultiplexing in renderer.
- For one-bit cross-window broadcast (#15's list refresh), `webContents.send` is the right primitive. Using `MessagePortMain` for that case forces a per-subscriber broker.
- Two primitives sounds inconsistent but each is used for what it is good at; ADR-0003's request/response contract is unchanged and `IpcContract` only grows by `pi:generateDrafts:start` and `pi:generateDrafts:cancel`.

The first implementation pass must verify the preload glue: receiving a `MessagePortMain` across the `contextIsolation` boundary and exposing it as a typed AsyncIterable to renderer code.

### 5. Tool set: read-only by construction; opt-in `web_search`; no `bash`

PiLog registers exactly the following tools against `pi-agent-core`'s `Agent`:

| Tool | Parameters | Backend |
| --- | --- | --- |
| `read_file` | `{ path, maxBytes? }` | `fs.readFileSync` with size cap (default 256 KB) |
| `list_dir` | `{ path, depth? }` | `fs.readdirSync` returning typed entries; entry-count cap (default 500) |
| `glob` | `{ pattern }` | `tinyglobby` or `fast-glob`, honoring `.gitignore`; result cap |
| `grep` | `{ pattern, path?, isRegex? }` | `@vscode/ripgrep` (`rg --json`); per-file and total match caps |
| `git_status` | `{}` | `simple-git` |
| `git_diff` | `{ path?, staged? }` | `simple-git` |
| `git_log` | `{ path?, limit? }` | `simple-git`; commit-message truncation; default cap 50 |
| `git_blame` | `{ path, lineRange? }` | `simple-git` (raw `blame`); bounded output |
| `submit_issue_drafts` | `{ drafts: GeneratedIssueDraft[] }` | exit tool — payload is the run result |

**Opt-in only, default off:** `web_search({ query, limit? })`. Registers when the user has enabled web search in Settings and configured a search-provider API key (Brave, Tavily, Google CSE, etc., stored via `safeStorage`). Returns URL + title + snippet structured results — never full page content.

**Explicitly excluded:**
- `bash`, `exec`, `shell` — eliminates an arbitrary-code-execution surface and removes the prompt-injection-via-note vector
- `web_fetch` (arbitrary URL retrieval) — pulls untrusted HTML/JSON into the agent's context
- `write_file`, `edit_file`, `apply_patch` — agent must not mutate the repo
- `npm test` / `pnpm test` / any test-runner or build tool — irrelevant for triage; mutates working tree
- `git_checkout`, `git_commit`, `git_pull`, `git_push`, any git mutation
- `read_issue_templates` — Phase 6 work; the agent can read templates as ordinary files via `read_file` if it really needs to in MVP

**Sandbox property** — every path argument is:

1. Resolved against the active `Repo.localPath` (the repo selected for the run).
2. `fs.realpathSync`-resolved and verified to stay within that root (no `..` escape, no symlink escape).
3. Checked against a denylist: `.git/objects/**`, `node_modules/**` (opt-in), `.env*`.

This is enforced **inside each tool's `execute` body**, not in the prompt. Prompt-injection cannot escape it.

**Tool execution mode:** `parallel` for read tools (stateless reads, no shared mutable state, parallel I/O speeds the run); the exit tool is a singleton terminator.

Rationale:
- This trades model output quality (models bench higher with `bash` available) for a real read-only-by-construction security property. We accept this trade for MVP and revisit if Phase 4–6 integration testing shows the agent hitting tool-shape limitations.
- Most legitimate triage uses of `bash` are representable as the named tools above (`git_log`, `git_blame`, `glob`, `grep`, etc.). The remaining bash uses (running tests, modifying files, reaching the network) are explicitly not what triage should do.
- `web_search` (bounded, structured results) and `web_fetch` (arbitrary HTML/JSON) have very different trust profiles. `web_search` opens a small, predictable surface controlled by a configured provider; `web_fetch` opens an unbounded one. They are not a single decision.
- OS-level / container sandboxing (Docker, bubblewrap, gVisor, Firecracker, App Sandbox, AppContainer) was considered and declined for MVP. The only cross-platform option (Docker) is a UX deal-breaker for a hotkey-driven scratchpad; the platform-native options are a triple of per-OS implementations whose value is conditional on giving the agent capable tools we are not giving it. Conditions for revisiting are below.

### 6. Packaging

| Artifact | Disposition |
| --- | --- |
| `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent` | `dependencies` → asar (pure JS) |
| `@vscode/ripgrep` | `dependencies` → **`asarUnpack`** (binary must be on disk to spawn) |
| `simple-git` | `dependencies` → asar (calls system `git`) |
| System `git` | runtime requirement; Phase 6 onboarding detects + surfaces clearly |

`electron-builder.yml` adds `asarUnpack: ["**/node_modules/@vscode/ripgrep/bin/**"]`. The `rg` binary participates in code-signing on macOS and Windows as part of the existing app-signing pipeline (`@vscode/ripgrep` is well-known and the ecosystem has worked this out). Pi's pure-JS files inherit the app's signature naturally — they live inside asar.

The first implementation pass must verify `@vscode/ripgrep`'s `rgPath` resolves correctly from main under a packaged build (`pnpm exec electron-builder --dir`).

### 7. Update channel

Pi's version is **pinned to an exact version** in `package.json` (no caret range), and travels with PiLog releases via the existing `electron-updater` channel. There is no separate Pi update channel, no in-app "update Pi" affordance, and no version skew between PiLog and its bundled Pi.

A boot-time runtime sanity check in `src/main/pi/runtime.ts` asserts `pi-agent-core` and `pi-ai` imported successfully; a failed assertion surfaces a non-dismissible banner ("PiLog's agent runtime didn't load — reinstall or check logs") and disables **Generate Drafts**.

Rationale:
- Exact-pinning makes Pi's version part of PiLog's changelog. A transient ranged update under our feet could change tool-call semantics or LLM-API request shape between user installs of the "same" PiLog release.
- Boot-time assertion catches a corrupted install at app start instead of at first **Generate Drafts** click.
- Co-shipping eliminates the "incompatible Pi version" failure mode from runtime concerns: it can only happen in pathologically corrupted installs, which the boot-time assertion catches anyway.

### 8. Failure modes

ADR-0005 commits to handling the following classes of failure with the listed surfaces. `agent_runs.status` is `running` | `succeeded` | `failed` | `cancelled` — the four-state enum lands from issue #12 onward; `cancelled` is a deliberate distinct terminal state, not a flavor of `failed`.

**Pre-run (no `agent_runs` row written):**
- Pi runtime didn't import → boot-time banner; **Generate Drafts** disabled.
- No active provider/model selected, or no credential for it → inline "Configure Pi to generate drafts" link deep-linking to Settings (per #13).
- Selected notes don't share a single `repoId` → bulk-action button disabled with explanatory tooltip.

**Pre-run (row written as `failed`):**
- `Repo.localPath` no longer exists at run time → `error` AgentEvent with `cause: 'repo_missing'`; UX action linking to Repositories settings.

**Mid-run (`failed`):**
- LLM API error / network outage / rate limit → `error` with classified `cause`: `auth_invalid` | `rate_limited` | `network` | `provider_error` | `unknown`.
- Pi internal crash (unhandledRejection in agent loop) → `error` with `cause: 'pi_internal'`.
- Turn-budget exceeded → `error` with `cause: 'turn_budget_exceeded'`. Default budget **20 turns**, persisted in the `settings` k/v table under `pi.turnBudget`, surfaced in **Settings → Advanced** from MVP. Tunable per user.
- `submit_issue_drafts` payload fails Pi-side schema validation after a small number of agent retries → `error` with `cause: 'schema_validation'`.
- `submit_issue_drafts` called multiple times → first call wins; subsequent calls are benign no-ops returning a "drafts already submitted" tool result so the agent loop terminates cleanly.
- Tool sandbox violation (path escape, denylist hit) → tool returns `{ isError: true }` to the agent (run continues); cascading sandbox errors lead to the turn-budget path.

**Mid-run (`cancelled`):**
- User clicks Cancel on the in-flight run → `pi:generateDrafts:cancel` IPC; main calls `agent.abort()`; port closes; row is `cancelled`.
- Renderer window closes mid-run → main detects `webContents.destroyed` and treats as cancel.

**Post-run:**
- DB transaction (drafts insert + notes status flip + agent_runs update) fails → emit `error` with `cause: 'persistence'`; row is `failed`. UX explicitly says "drafts were generated but couldn't be saved; please retry."
- Partial persistence is impossible — single `db.transaction()` per ADR-0001.

**Persistence:** the **full** Pi event stream for each run is persisted (not just the projected `AgentEvent`s) so issue #15's Agent Runs view can render the transcript for prompt iteration. Schema details are #12's call; ADR-0005 only commits that the full stream is captured.

## Consequences

### Positive

- The agent is read-only by construction. Prompt-injected note content cannot mutate the user's repo, run shells, or reach arbitrary network destinations.
- Provider credentials live in OS keychain via `safeStorage` from day one — no plaintext credential file appears on disk under PiLog's authority.
- The exit-tool pattern collapses two validation steps (Pi-side parameter schema, persistence-side Zod) into one schema applied once.
- Pi version pinning + electron-updater bundling eliminates a class of cross-version compatibility issues and makes Pi part of PiLog's changelog.
- `MessagePortMain` per invocation gives per-run lifecycle natively, maps onto AsyncIterable, and is friendly to a future move to a process-isolated Pi if conditions for revisiting trigger.
- ADR-0003's request/response IPC contract is unchanged; streaming is an additive primitive governed here, not a replacement for `IpcContract`.

### Negative / accepted costs

- **No crash isolation.** A Pi-side fault that escapes Pi's event/error model can take down PiLog. Mitigation: pure-JS HTTP-bound Pi makes catastrophic faults very unlikely. Conditions for revisiting are below.
- **Lower model output quality than with bash available.** Models bench better on coding tasks when `bash` is in the tool set. We accept this for MVP because the named read-only tools cover legitimate triage uses; we revisit if integration testing shows the agent hitting tool-shape limitations.
- **No general web access.** `web_fetch` is unavailable; only opt-in `web_search` with bounded results.
- **PiLog owns ~60 lines of credential-storage glue (`SafeStorageAuthStorage`).** A new Pi major version that changes the `AuthStorage` interface forces a small adapter update. Worth it for OS-keychain compliance.
- **Two IPC primitives instead of one.** `MessagePortMain` for per-run streams, `webContents.send` for cross-window broadcast. Documented division; not free, but each is used for what it's good at.

### Conditions for revisiting

1. **Capable tools (`bash`, `web_fetch`, `exec`, write/edit) become warranted** — for example, if Phase 4–6 integration testing shows the curated tool set caps draft quality. Revisiting then triggers (a) reverting to child-process embedding, and (b) per-platform OS-native sandboxing (App Sandbox / AppContainer / namespaces). Scope: a follow-up ADR.
2. **Pi-side instability in-process** — if Pi-induced crashes affect users in practice (not theory), child-process embedding becomes the answer.
3. **`AuthStorage` constructor injection turns out to be sealed** — first implementation pass discovers this; mitigation is subclassing the concrete `AuthStorage` and overriding persistence methods. Recorded here as a known empirical question.
4. **Pi adds a structured-output mode native to `pi-ai`** — if such an API supersedes the exit-tool pattern, we adopt it. Until then exit-tool is the contract.

### Rejected alternatives

- **Child-process embedding via `pi --mode rpc`.** Adds a serialize/parse layer with no behavioral gain for a JS-on-JS embedding. Cancellation, BYOK transit, and AsyncIterable mapping are all cleaner in-process. Rejected unless conditions for revisiting trigger.
- **Embedding `@earendil-works/pi-coding-agent` as the agent layer.** The coding-agent SDK's session prompt is tuned for "act like Claude Code" and its tool set ships `edit`/`write`/`bash`. We would be working against its grain; the read-only-by-construction property would become "read-only by tool-filter discipline" — weaker. Rejected.
- **Storing credentials in `~/.pi/agent/auth.json` directly.** Plaintext file contradicts PRD §7's OS-keychain requirement. Two writers (PiLog + standalone `pi`) on one file is a UX confound. Rejected.
- **OS-level / container / microVM sandboxing for MVP.** Docker requires a multi-GB user-installed daemon, a UX deal-breaker. bubblewrap / gVisor / Firecracker are Linux-only. macOS App Sandbox / Windows AppContainer / Linux namespaces are a per-platform triple whose value is conditional on capable tools we are not giving the agent. Rejected for MVP; revisit per condition #1 above.

## Downstream issue impacts

- **#11 (this ADR's parent issue)** — re-scoped: deliver this ADR + propagate restructure through #12–#15. No spike branch.
- **#12** — extends the `agent_runs.status` enum to include `cancelled` from day one. Tracer-bullet acceptance includes the three first-pass empirical guards (process mutation, exit-tool termination, `AuthStorage` injection). Reads `pi.turnBudget` from settings rather than hardcoding.
- **#13** — Settings → Provider & Model surfaces `ModelRegistry`'s catalogs; `SafeStorageAuthStorage` is the storage backend; the "Open advanced config" affordance is reframed as "Import existing Pi config" / "View active config" / "Reset Pi config" since PiLog has no `~/.pi/agent/auth.json` to point at.
- **New sibling to #13** — Settings → Advanced exposes the Turn Budget control (numeric, default 20) and the Web Search toggle + provider API key.
- **#14** — implements the eight read-only tools (`read_file`, `list_dir`, `glob`, `grep`, `git_status`, `git_diff`, `git_log`, `git_blame`) with the sandbox property enforced inside each `execute` body.
- **#15** — Agent Runs status filter chips include `cancelled` alongside `running` / `succeeded` / `failed`; renders the persisted full Pi event stream for the detail view.
