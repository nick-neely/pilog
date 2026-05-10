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

**Local-loopback OAuth callback** for authentication, **`safeStorage`-backed file storage** for token persistence.

- The loopback flow is preferred for desktop UX: the user clicks one button, authorises in their default browser, and returns to Pilog already connected. No code to copy.
- `safeStorage.encryptString()` encrypts the token; the resulting buffer is base64-encoded and written to `{userData}/secrets.json`. On read, the buffer is decrypted with `safeStorage.decryptString()`.
- If `safeStorage.isEncryptionAvailable()` returns false in a packaged app (rare — headless Linux without a keyring), the module logs a warning and refuses to persist. During development only, Pilog falls back to a plaintext `secrets.dev.json` file under Electron `userData` so WSL2/dev environments can exercise the full GitHub flow.
- OAuth client ID and client secret are supplied via build-time environment variables (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`). Neither appears in the renderer or preload bundle — they're only read in the main process at runtime.
- The token never touches `pilog.sqlite`.

## Consequences

- A one-time human setup step is required: register a GitHub OAuth App at `github.com/settings/developers`, set the callback URL to `http://127.0.0.1`, and supply the client ID + secret as env vars.
- The loopback server binds to port 0 (OS-assigned) and shuts down immediately after receiving the callback, minimising the attack surface.
- `secrets.json` is only readable by the current OS user and only decryptable on the same machine. Moving the file to another machine or user account renders it useless.
- Downstream slices (repo registration, issue compose) import the Octokit client created by this slice — no additional auth work needed.
