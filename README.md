# PiLog

PiLog is a **local-first Electron desktop app** for developers who want to **capture rough markdown notes on a hotkey** and **triage them in an inbox** before they become GitHub issues. Today the repo implements the capture pipeline (scratchpad, tray, SQLite persistence, typed IPC) and GitHub sign-in from Settings—set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env` (see **Environment variables**). The integrated Pi agent for draft issues is **planned**—see `docs/pilog_prd.md` and `docs/implementation-plan.md`.

**Why:** Writing the note is easy; turning half-formed thoughts into good issues without leaving your editor flow is hard. PiLog separates _capture_ from _triage_ so you can dump thoughts instantly and shape them later.

**How:** The **main process** owns the database, windows, and hotkeys; the **renderer** talks to it only through a typed **`window.pilog`** API exposed from the preload script. Notes live in SQLite under the app user data directory.

## Requirements

- [Node.js](https://nodejs.org/) 22.12 or newer
- [pnpm](https://pnpm.io/) — the repo pins the package manager in `package.json`

## Install

```bash
pnpm install
```

Native deps are intentionally split by runtime:

- The repo root installs development and test dependencies for Node-based tooling such as Vitest.
- `app/` installs Electron runtime dependencies and is rebuilt by `pnpm run app:rebuild` during `postinstall`.

This keeps native modules such as `better-sqlite3` from bouncing between the Node ABI used by tests and the Electron ABI used by the app.

## Environment variables

Put a `.env` file in the repo root ([electron-vite](https://electron-vite.org/guide/env-and-mode.html) loads it for the main process). Start from `.env.example`.

**GitHub:** Create an [OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app). Authorization callback URL: `http://127.0.0.1/callback`. Add the client ID and client secret to `.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

**Optional:** `PILOG_USER_DATA` — custom Electron `userData` directory (used in e2e tests).

## Development

```bash
pnpm dev
```

Runs the app in development with HMR via [electron-vite](https://electron-vite.org/).

## Build

Full check and bundle (runs TypeScript checks, then `electron-vite build` into `app/out`):

```bash
pnpm build
```

Platform installers via [electron-builder](https://www.electron.build/):

```bash
pnpm build:win    # runs `pnpm build`, then Windows target
pnpm build:mac    # bundles then macOS target (run `pnpm build` first if you want a typechecked bundle)
pnpm build:linux  # bundles then Linux target (same note as macOS)
```

### Windows builds from WSL2

`pnpm build:win` works from WSL2, but electron-builder needs Wine with 32-bit support so it can run Windows resource tools such as `rcedit`.

On a fresh WSL install:

```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install --install-recommends wine32:i386 wine64 libwine:i386 fonts-wine
rm -rf ~/.wine
wineboot --init
pnpm build:win
```

After building in WSL, run the generated Windows installer/executable from Windows proper to test the real Windows experience.

Unpack a directory build without an installer:

```bash
pnpm build:unpack
```

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test        # Vitest (unit)
pnpm test:e2e    # Playwright against the built app
```

## Documentation

| Doc                           | Contents                               |
| ----------------------------- | -------------------------------------- |
| `docs/pilog_prd.md`           | Product requirements and flows         |
| `docs/implementation-plan.md` | Phased roadmap and acceptance criteria |
| `CONTEXT.md`                  | Domain vocabulary and glossary         |

Editor tooling: ESLint and Prettier configs are included for contributors using VS Code or similar.
