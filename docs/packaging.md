# Pilog Packaging

Pilog's primary distribution path is a direct download from `https://pilog.dev`. GitHub Releases are the secondary archive and power-user path.

The size and performance workflow in this document belongs to PRD #65. The
landed slices are the packaged performance baseline runner (#66), packaged
artifact inventory (#67), non-blocking packaged size budgets (#68), packaged
performance budgets and regression reporting (#69), packaged file hygiene
enforcement (#70), first measured pruning pass (#71), Release Action size
report publishing (#73), and this maintainer documentation (#74).

## Current MVP Signing Scope

- Windows builds are signing-ready but unsigned until a code-signing certificate is purchased.
- macOS builds are unsigned and not notarized until an Apple Developer Program account is available.
- Linux builds are produced through Electron Builder targets and are not signed in MVP.
- App updates are tracked separately in #41. This document does not configure an update provider.

## Build Commands

Packaged builds must receive the public GitHub OAuth client ID at build time so
Device Flow works without a user-provided secret:

```bash
PILOG_BUNDLED_GITHUB_CLIENT_ID=... pnpm build:unpack
PILOG_BUNDLED_GITHUB_CLIENT_ID=... pnpm build:win
PILOG_BUNDLED_GITHUB_CLIENT_ID=... pnpm build:mac
PILOG_BUNDLED_GITHUB_CLIENT_ID=... pnpm build:linux
```

GitHub Actions release workflows read this value from the repository variable
`PILOG_BUNDLED_GITHUB_CLIENT_ID`, falling back to a repository secret with the
same name. The value is a public OAuth client ID; no client secret should be
bundled into distributable builds.

```bash
pnpm build:unpack
pnpm build:win
pnpm build:mac
pnpm build:linux
```

## Packaged Artifact Inventory

After `pnpm build:unpack`, run:

```bash
pnpm inventory:packaged
```

The command inspects the current platform's unpacked Electron Builder output under `dist/` and reports total unpacked size, largest files/directories, `app.asar` versus `app.asar.unpacked` size, native/executable payloads, required runtime dependencies, required runtime assets, and forbidden categories such as tests, fixtures, development caches, source maps, and build leftovers. Pass an explicit unpacked app directory when inspecting a non-default output, for example:

```bash
pnpm inventory:packaged dist/linux-unpacked
```

Source maps are forbidden by default in the baseline report. Use `-- --allow-source-maps` only when a release intentionally retains them for diagnostics.

## Reading Inventory Reports

Start with the total unpacked size and the `app.asar` /
`app.asar.unpacked` split. Growth in `app.asar` usually means compiled app
output, JavaScript runtime dependencies, or bundled assets changed. Growth in
`app.asar.unpacked` usually means native bindings or executable payloads
changed, which affects signing, installer size, and cross-platform packaging
risk.

Then review the attribution sections in this order:

- **Forbidden findings** must be resolved before release unless a documented
  diagnostic source-map release intentionally opts in. Tests, fixtures, caches,
  source maps, and build leftovers are not product capability.
- **Required runtime assets** should stay present. Missing SQLite bindings, Pi
  packages, repo-search tooling, updater metadata, secure-storage dependencies,
  icons, or tray resources are release regressions, even if the package is
  smaller.
- **Native and executable payloads** need platform-specific scrutiny. New or
  larger `.node` files, repo-search binaries, or helper executables should have
  a runtime reason and should be checked on every Supported Download Platform.
- **Largest files/directories** are the first place to look for dependency or
  asset growth. Compare before/after reports when a feature adds a runtime
  dependency, fixture, generated asset, or packaging rule.

## Packaged File Hygiene

Electron Builder excludes release-forbidden file categories before writing the
packaged app, and the `afterPack` verifier fails the build if any still ship in
`app.asar` or `app.asar.unpacked`.

Forbidden categories are:

- tests and specs (`test`, `tests`, `__tests__`, `*.test.*`, `*.spec.*`)
- fixtures (`fixtures`, `__fixtures__`)
- development caches (`.cache`, `.vite`, `.turbo`)
- build leftovers (`*.tsbuildinfo`, `.DS_Store`, `Thumbs.db`, `coverage`, `.nyc_output`)
- source maps, unless an intentional diagnostic release changes the package
  file rules and sets `PILOG_ALLOW_PACKAGED_SOURCE_MAPS=1`

Allowed exceptions remain limited to files needed at runtime: compiled app
output, runtime package metadata/dependencies, SQLite native bindings, Pi
packages, repo-search executables, updater support, app icons, and tray
resources. The verifier still reports native and executable payloads through
the inventory and size-budget output so changes to unpacked runtime payloads are
visible during release review.

## Packaged Size Budgets

After `pnpm build:unpack`, run the non-blocking size comparison:

```bash
pnpm budget:packaged
```

Or build the current platform's unpacked app and compare it in one step:

```bash
pnpm budget:packaged:build
```

The command writes `dist/packaged-size-budget-report.json` and prints a maintainer-readable report. It reuses the packaged artifact inventory baseline, then compares the current `dist/` output against initial budgets for:

- Supported Download Platform artifacts: macOS DMG and updater ZIP, Windows NSIS setup, Linux AppImage, and Linux deb.
- The whole unpacked Electron Builder app output.
- `app.asar` and `app.asar.unpacked` payload sizes.
- Individual native or executable payloads.
- Large runtime dependency directories that are big enough to justify follow-up pruning.

This first budget pass is intentionally **non-blocking**. Over-budget or missing download artifacts are report findings only; they should not fail local packaged builds, Release Actions, or pull requests until a later enforcement issue makes that policy explicit.

Stable and preview Release Actions publish the same inventory and budget output
for every platform build. Each build job packages with Electron Builder
publishing disabled, writes reports under `dist/reports/<channel>-<platform>/`,
uploads them as a GitHub Actions artifact named
`packaged-size-reports-<channel>-<platform>`, and then publishes the release
artifacts, updater metadata, checksums, and Release Manifest inputs. This keeps
stable metadata (`latest*.yml`) and preview metadata (`preview*.yml`) separated
while making size growth inspectable at the release boundary.

Initial budgets live in `scripts/packaged-size-budget.ts` as `INITIAL_PACKAGED_SIZE_BUDGETS`. They are rounded above the first artifact inventory baseline so maintainers can see meaningful growth before enforcing failures:

| Budget area                     | Initial budget |
| ------------------------------- | -------------- |
| macOS DMG installer             | 350 MiB        |
| macOS updater ZIP               | 350 MiB        |
| Windows NSIS setup              | 275 MiB        |
| Linux AppImage                  | 275 MiB        |
| Linux deb                       | 240 MiB        |
| Unpacked packaged app           | 800 MiB        |
| `app.asar` archive              | 120 MiB        |
| `app.asar.unpacked` payload     | 280 MiB        |
| Single native/executable file   | 90 MiB         |
| Large runtime dependency folder | 120 MiB        |

To intentionally update a budget, run `pnpm inventory:packaged` and `pnpm budget:packaged` against the packaged output, confirm the growth is caused by product scope rather than shipped tests, fixtures, caches, source maps, or build leftovers, then update the matching `INITIAL_PACKAGED_SIZE_BUDGETS` entry with a short rationale. Commit the budget update together with the product change or with a release-maintenance note that names the report path and reason for growth.

Do not reduce size by deleting required runtime capabilities. Budget work must preserve SQLite, Pi runtime packages, repo-search, updater support, secure-storage behavior, and app/tray identity assets. The report repeats those protected capabilities and includes largest files, largest directories, native/executable payloads, runtime dependencies, forbidden findings, and required runtime assets so growth remains attributable enough for follow-up pruning work.

## Local Reports vs Release Enforcement

Local inventory, size, and performance commands are diagnostic feedback loops:

- `pnpm inventory:packaged` shows what the unpacked packaged app ships.
- `pnpm budget:packaged` writes a non-blocking size-budget comparison.
- `pnpm perf:packaged` writes a packaged performance baseline and non-blocking
  performance-budget comparison.

These local commands should guide review and before/after comparisons, but they
do not make ordinary development fail because workstation hardware, display
servers, and packaging targets vary. CI and Release Actions currently enforce
typecheck, Vitest, release version validation, Electron Builder packaging, and
the `afterPack` packaged-file hygiene verifier. Release Actions also upload
size reports so maintainers can inspect growth before artifacts are published
to users.

Do not treat a local over-budget size finding as permission to delete product
capability. Treat it as a request for attribution: identify the changed
dependency, native payload, source map, fixture, test file, or asset; decide
whether it belongs in the packaged runtime; and update the budget only when the
growth is intentional product scope. Treat a local over-budget performance
finding the same way: identify the scenario, compare reports on comparable
hardware, and enforce only through an intentional release or CI command such as
`--enforce-budgets`.

## First Measured Optimization Pass

Issue #71 used the first Linux unpacked baseline to target build-only native
package payload in `app.asar.unpacked`. The before report was written to
`dist/issue-71-before-size-budget.json` from a `dist/linux-unpacked` output of
about 384 MiB. The baseline finding was concentrated in required native
dependencies that Electron Builder must unpack because they contain `.node`
files:

- `resources/app.asar.unpacked/node_modules/better-sqlite3/deps` contained the
  SQLite amalgamation and headers used to compile the native binding, while the
  packaged runtime only needs `build/Release/better_sqlite3.node` plus the
  JavaScript package files.
- `resources/app.asar.unpacked/node_modules/koffi/build/koffi` contained native
  binaries for many platforms even though a packaged artifact can only run on
  its target platform and architecture.
- `koffi/doc`, `koffi/src`, and `koffi/vendor` were build/documentation payload,
  not runtime product capability.

The `afterPack` verifier now verifies the full packaged runtime, prunes those
build-only directories, and then rechecks the required unpacked runtime files.
It keeps the current target's Koffi binary, keeps the SQLite native binding, and
preserves required runtime imports, SQLite, Pi packages, repo-search, updater
metadata, and app assets.

On the first Linux x64 pass, the after report was written to
`dist/issue-71-after-size-budget.json` and showed:

| Area                        | Before    | After     | Change    |
| --------------------------- | --------- | --------- | --------- |
| Unpacked packaged app       | 382.9 MiB | 348.5 MiB | -34.4 MiB |
| `app.asar.unpacked` payload | 46.5 MiB  | 12.1 MiB  | -34.4 MiB |
| `app.asar` archive          | 52.2 MiB  | 52.2 MiB  | no change |

Regenerate the comparison with:

```bash
pnpm build:unpack
pnpm budget:packaged dist/linux-unpacked -- --output dist/issue-71-after-size-budget.json
```

The before/after report pair should show the impact in the unpacked app,
`app.asar.unpacked` payload, native/executable attribution, and largest
directory attribution. This is intentionally a native-package payload cleanup,
not a rewrite of the main/preload/renderer boundary and not a change to the
embedded Pi strategy.

Residual risk: the Koffi pruning is target-platform specific. Cross-platform
release builds must continue to run `afterPack` and packaged smoke on each
Supported Download Platform so a package-level native-loading change is caught
before release.

The canonical icon source is `design/icon-variants/pilog-app-icon.png`. The committed app icon assets consumed by Electron Builder are:

- `build/icon.png`
- `build/icon.ico`
- `build/icon.icns`
- `resources/icon.png`

Use FFmpeg for PNG/ICO resizing and lossless PNG recompression when those committed assets need to be refreshed. FFmpeg does not write ICNS directly; keep `build/icon.icns` committed for macOS packaging.

## Packaged Runtime Smoke

Run:

```bash
pnpm test:e2e:packaged
```

This creates an unpacked Electron Builder output and verifies that the packaged app launches outside the dev server, opens the Inbox, creates and lists notes, generates fixture drafts, opens core surfaces, and resolves the runtime dependencies needed by generation:

- `better-sqlite3`
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-ai`
- `@vscode/ripgrep` from `app.asar.unpacked`

The packaged smoke uses `PILOG_DEBUG_IPC=1` and a temporary `PILOG_USER_DATA` directory. Debug IPC must remain unavailable unless `PILOG_DEBUG_IPC=1` is set.

## Packaged Performance Baseline

Run against an existing unpacked Electron Builder output:

```bash
pnpm perf:packaged -- --app-out-dir dist/linux-unpacked
```

Or build the unpacked app first and then measure it:

```bash
pnpm perf:packaged:build
```

The runner launches the packaged app outside the dev server and writes
`dist/packaged-performance-baseline.json` by default. It also writes
`dist/packaged-performance-budget-report.json`, comparing those timings against
the initial release-tolerance budgets. The JSON reports include app/build
metadata, diagnostic context, scenario names, timings, budget status, and enough
context to identify which scenario regressed.

- cold launch to usable Inbox window
- Scratchpad open from the packaged application menu path
- note creation and listing
- fixture-backed Agent Run to generated draft
- Draft Review navigation

Local packaged performance runs are informational by default. Local machine
noise should not fail ordinary development, so an over-budget scenario prints
and writes a report finding without exiting non-zero. CI or Release Actions can
opt into enforcement with:

```bash
pnpm perf:packaged -- --app-out-dir dist/linux-unpacked --enforce-budgets
```

When enforcement is enabled, any missing or over-budget scenario exits non-zero.
This keeps threshold decisions explicit at the release boundary while preserving
the local feedback loop. Like the packaged smoke, the runner uses
`PILOG_DEBUG_IPC=1` with temporary app data so it can seed fixture notes and run
the agent path without live provider credentials.

Initial packaged performance budgets live in
`scripts/packaged-performance.cjs` as
`INITIAL_PACKAGED_PERFORMANCE_BUDGETS`. They are deliberately coarse first-pass
release tolerances for the packaged baseline runner's user-visible scenarios.
The first reference run was a Linux x64 unpacked packaged build measured on
2026-05-13:

| Scenario                    | Reference run | Initial budget |
| --------------------------- | ------------- | -------------- |
| Cold launch to usable Inbox | 1200 ms       | 6000 ms        |
| Scratchpad open             | 186.1 ms      | 1000 ms        |
| Note create and list        | 23.8 ms       | 750 ms         |
| Draft Review navigation     | 217.7 ms      | 1000 ms        |
| Fixture Agent Run to draft  | 76 ms         | 15000 ms       |

To intentionally update a performance budget, run `pnpm perf:packaged` against
the packaged target under review, compare the new
`packaged-performance-baseline.json` and
`packaged-performance-budget-report.json` with the previous release's reports,
then update the matching budget with a short rationale. Budget increases should
name the product behavior that got more expensive. Budget decreases should be
based on repeated clean packaged runs on comparable hardware.

When comparing performance reports, keep scenario names stable and compare the
same packaged target on comparable hardware. The most useful regression note is
the scenario that changed, the before/after `packaged-performance-baseline.json`
and `packaged-performance-budget-report.json` paths, and whether trace capture
was enabled. If a fixture Agent Run budget fails, inspect whether the UI stayed
responsive and whether progress/cancel affordances remained usable; do not hide
Agent Run UI freezes behind the longer runner timeout.

## Electron Trace Diagnostic Mode

Electron trace capture is off by default. Maintainers can opt in for packaged
startup/runtime investigation with either `PILOG_ELECTRON_TRACE=1` or the
explicit `--pilog-trace` launch flag. Normal user operation does not start trace
capture, write trace files, or expose a performance UI.

For packaged performance runs, write traces outside the temporary app data
directory so the runner cleanup does not remove them:

```bash
PILOG_ELECTRON_TRACE=1 \
PILOG_ELECTRON_TRACE_DIR=dist/electron-traces \
pnpm perf:packaged -- --app-out-dir dist/linux-unpacked
```

To bound capture time, set `PILOG_ELECTRON_TRACE_DURATION_MS`:

```bash
PILOG_ELECTRON_TRACE=1 \
PILOG_ELECTRON_TRACE_DURATION_MS=10000 \
PILOG_ELECTRON_TRACE_DIR=dist/electron-traces \
pnpm perf:packaged -- --app-out-dir dist/linux-unpacked
```

The app logs the written `electron-trace-*.json` path and inspection guidance.
Open the trace in `chrome://tracing` or `https://ui.perfetto.dev`. The trace
uses Electron/Chromium process, startup, V8, Node, GPU/compositor, loading, and
timeline categories; it deliberately avoids netlog categories and does not add
Note contents, credentials, linked Repo contents, or provider secrets to normal
logs.

## Contributor Packaging Review

Before shipping a change that affects runtime dependencies, packaging rules,
native modules, source maps, tests, fixtures, or assets:

- Build an unpacked package for the affected platform and run
  `pnpm inventory:packaged` plus `pnpm budget:packaged`.
- If user-visible responsiveness could change, run `pnpm perf:packaged` against
  the same unpacked output and keep the JSON report path in the review notes.
- Confirm new runtime dependencies are needed in the packaged app, not just in
  development. Prefer keeping build/test tooling outside the runtime package
  boundary.
- Justify native and executable payloads by platform. Keep required target
  binaries, but do not ship build inputs, docs, source trees, or binaries for
  unrelated platforms unless the runtime truly needs them.
- Keep source maps out of normal releases. If a diagnostic build intentionally
  includes them, document why, use the explicit source-map opt-in, and account
  for the extra size.
- Keep tests and fixtures out of packaged artifacts. Test data belongs in the
  repo and CI, not in normal user installs.
- Check generated or bundled assets for size and runtime necessity. Preserve app
  icons, tray resources, updater metadata, and any asset required by packaged
  smoke coverage.
- Commit budget changes with the product change that requires them, and include
  the report path and rationale in the commit or release-maintenance note.
