# ADR 0004: GitHub Auth Flow

## Status

Accepted

## Context

Phase 2 requires connecting a GitHub account from inside Pilog. Two viable OAuth strategies exist for Electron desktop apps:

1. **Local-loopback callback** – Start an HTTP server on `127.0.0.1` with a random port, open the system browser to GitHub's `/login/oauth/authorize` with `redirect_uri` pointing at the loopback server. GitHub redirects back with a `code`; the main process exchanges it for a token.
2. **Device flow** – POST to `/login/device/code`, display a user-code in Pilog, open `github.com/login/device` in the browser, poll until the user approves. No loopback server needed but UX is clunkier (copy-paste a code).

For token storage, options considered:

1. **Electron `safeStorage`** – OS-level encryption (Keychain on macOS, DPAPI on Windows, libsecret on Linux). Encrypted blob stored in a JSON file in `userData`, never in SQLite.
2. **`keytar` / credential store** – Direct OS keychain access. Requires native compilation and has been largely superseded by `safeStorage` in modern Electron.
3. **SQLite settings table** – Plaintext or app-level encryption. Violates the PRD security requirement.

## Decision

**GitHub OAuth Device Flow** for packaged/default authentication, **development/test-only local-loopback OAuth** as an explicit opt-in, and **`safeStorage`-backed file storage** for token persistence.

- Packaged builds use Device Flow with a public bundled client ID. This keeps distributable builds free of `GITHUB_CLIENT_SECRET` and avoids asking each user to create an OAuth app.
- The GitHub OAuth app used for Pilog distribution must have Device Flow enabled in GitHub developer settings.
- The loopback flow is limited to development/testing. It is only used when `PILOG_GITHUB_AUTH_FLOW=loopback`, `is.dev` is true, and `GITHUB_CLIENT_SECRET` is present.
- `safeStorage.encryptString()` encrypts the token; the resulting buffer is base64-encoded and written to `{userData}/secrets.json`. On read, the buffer is decrypted with `safeStorage.decryptString()`.
- If `safeStorage.isEncryptionAvailable()` returns false in a packaged app (rare — headless Linux without a keyring), the module logs a warning and refuses to persist. During development only, Pilog falls back to a plaintext `secrets.dev.json` file under Electron `userData` so WSL2/dev environments can exercise the full GitHub flow.
- `PILOG_BUNDLED_GITHUB_CLIENT_ID` is statically bundled into the main-process build for packaged Device Flow. Development may use `GITHUB_CLIENT_ID` as a local override. `GITHUB_CLIENT_SECRET` is only read for the explicit loopback development/test path.
- The token never touches `pilog.sqlite`.

## Consequences

- Distribution requires one Pilog-owned GitHub OAuth App with Device Flow enabled and its public client ID bundled at build time.
- The loopback server remains available for local development only. It binds to port 0 (OS-assigned) and shuts down immediately after receiving the callback, minimising the attack surface.
- Device Flow shows the user code in Pilog, opens GitHub's device authorization page, polls through pending and slow_down states, and reports denied, expired, cancelled, and network-failure states in plain language.
- `secrets.json` is only readable by the current OS user and only decryptable on the same machine. Moving the file to another machine or user account renders it useless.
- Downstream slices (repo registration, issue compose) import the Octokit client created by this slice — no additional auth work needed.
