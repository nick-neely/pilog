# Pilog

[![React Doctor](https://www.react.doctor/share/badge?p=pilog&s=91&w=34&f=18)](https://www.react.doctor/share?p=pilog&s=91&w=34&f=18)

Pilog is a local-first Electron app for capturing rough developer notes and turning them into GitHub-ready issue drafts. Use the global scratchpad to jot something down without leaving your current flow, then triage those notes later from the inbox.

The app currently supports:

- Global hotkey scratchpad with markdown editing
- Local SQLite persistence across restarts
- Inbox search, filters, multi-select, note editing, and repo assignment
- GitHub sign-in, local repository linking, and manual issue publishing
- Embedded Pi draft generation from selected notes and linked repo context
- Agent run history for inspecting generated drafts, errors, and transcripts
- Draft Review publishing and explicit repo-scoped auto-publish with a local publish log

## Requirements

- [Volta](https://volta.sh/) for pinned Node.js and pnpm versions
- Node.js 22.21.1 and pnpm 10.30.3 are pinned in `package.json`

Verify the toolchain from the repo root:

```bash
node --version
pnpm --version
```

## Setup

```bash
pnpm install
cp .env.example .env
```

The `.env` file is only needed for GitHub OAuth. You can launch the app without filling it in, but GitHub sign-in will not work until `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set.

For GitHub sign-in, create a GitHub OAuth App with this callback URL:

```text
http://127.0.0.1/callback
```

Then add the credentials to `.env`:

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

Optional development setting:

```bash
PILOG_USER_DATA=/tmp/pilog-dev-profile
```

In WSL2, Electron `safeStorage` may be unavailable without a Linux keyring. In development only, Pilog falls back to a plaintext `secrets.dev.json` file in Electron `userData` so GitHub and Pi credential flows can still be exercised. Packaged builds do not use that fallback.

## Development

```bash
pnpm dev
```

Native runtime dependencies live in `app/` and are installed/rebuilt by the root `postinstall` script. This keeps Electron native modules such as `better-sqlite3` separate from the Node tooling ABI used by tests.

## Pi Draft Generation

Draft generation requires:

1. A linked local repository in Settings → Repositories.
2. A Pi provider, model, and API key in Settings → Provider & Model.
3. One or more selected inbox notes that all belong to the same linked repo.

Select the notes in the inbox and click **Generate Drafts**. Pilog persists the run, generated drafts, source-note links, affected files, confidence, and grouping reason locally. Use the Agent Runs view to inspect outputs and errors.

## Build

```bash
pnpm build
```

Platform builds:

```bash
pnpm build:win
pnpm build:mac
pnpm build:linux
```

Create an unpacked directory build:

```bash
pnpm build:unpack
```

Packaging and signing notes live in `docs/packaging.md`. The intended user-facing distribution path is a direct download from `https://pilog.dev`; GitHub Releases remain the power-user/archive path. Windows and macOS builds are signing-ready but unsigned for MVP until the relevant certificates/accounts are available.

### Windows Builds From WSL2

`pnpm build:win` works from WSL2, but electron-builder needs Wine with 32-bit support for Windows resource tools such as `rcedit`.

```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install --install-recommends wine32:i386 wine64 libwine:i386 fonts-wine
rm -rf ~/.wine
wineboot --init
pnpm build:win
```

After building in WSL, run the generated Windows installer or executable from Windows proper to test the real Windows experience.

## Quality Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:e2e:packaged
```

`pnpm test:e2e` runs Playwright against the app. Some GitHub/Pi paths depend on local credentials and are skipped when the required environment is missing.

`pnpm test:e2e:packaged` builds an unpacked app and verifies that packaged runtime dependencies load outside the dev server.

The Review Mode publish e2e creates a real GitHub issue and is skipped unless both variables are set:

```bash
PILOG_E2E_GITHUB_TOKEN=github_pat_...
PILOG_E2E_GITHUB_REPO=owner/sandbox-repo
pnpm test:e2e -- e2e/review-mode-publish.spec.ts
```

Use a sandbox repository. The token must be allowed to create issues in `PILOG_E2E_GITHUB_REPO`; `GITHUB_TOKEN` or `GH_TOKEN` can be used instead of `PILOG_E2E_GITHUB_TOKEN`.

## Documentation

| Doc                           | Contents                                  |
| ----------------------------- | ----------------------------------------- |
| `PRODUCT.md`                  | Product strategy and positioning          |
| `DESIGN.md`                   | Visual system and UX constraints          |
| `CONTEXT.md`                  | Domain vocabulary and glossary            |
| `docs/pilog_prd.md`           | Product requirements and flows            |
| `docs/implementation-plan.md` | Phased roadmap and acceptance criteria    |
| `docs/packaging.md`           | Packaged builds, icons, and signing scope |
| `docs/adr/`                   | Architecture decision records             |
