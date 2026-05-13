# Pilog Packaging

Pilog's primary distribution path is a direct download from `https://pilog.dev`. GitHub Releases are the secondary archive and power-user path.

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
`dist/packaged-performance-baseline.json` by default. The JSON report includes
app/build metadata, diagnostic context, and timings for:

- cold launch to usable Inbox window
- Scratchpad open from the packaged application menu path
- note creation and listing
- fixture-backed Agent Run to generated draft
- Draft Review navigation

These timings are informational baselines, not budgets. Local machine noise
should not fail ordinary development. Like the packaged smoke, the runner uses
`PILOG_DEBUG_IPC=1` with temporary app data so it can seed fixture notes and run
the agent path without live provider credentials.
