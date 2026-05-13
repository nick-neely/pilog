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
