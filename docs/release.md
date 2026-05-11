# Release Guide

## Overview

Pilog publishes stable and preview GitHub Releases through explicit Release Actions. Releases are **never** published on ordinary branch pushes or pull requests — only an intentional version tag push or a manual workflow dispatch triggers publishing.

This is per ADR-0006: GitHub Releases are the V1 canonical release/update source. `pilog.dev` reads a static Release Manifest over those artifacts rather than querying GitHub live.

---

## Channels

| Channel | Tag format | GitHub Release type | Updater metadata file |
|---------|-----------|---------------------|-----------------------|
| Stable  | `vX.Y.Z`  | Release (non-draft) | `latest.yml` / `latest-mac.yml` / `latest-linux.yml` |
| Preview | `vX.Y.Z-preview.N` | Pre-release | `preview.yml` / `preview-mac.yml` / `preview-linux.yml` |

Stable and preview artifacts coexist in GitHub Releases without collision because preview artifact names embed `-preview` before the extension (e.g. `Pilog-1.2.3-preview.dmg` vs `Pilog-1.2.3.dmg`).

---

## Version naming

- **Stable**: `1.2.3` → tag `v1.2.3`
- **Preview**: `1.2.3-preview.4` → tag `v1.2.3-preview.4`

The version in `package.json` must match the tag before publishing. electron-builder reads `package.json` version to name artifacts and create the GitHub Release.

---

## Publishing a stable release

### 1. Bump the version

```bash
# Update package.json version to X.Y.Z, commit, tag, and push
npm version X.Y.Z --no-git-tag-version   # or edit package.json directly
git add package.json
git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

The `Release — Stable` workflow triggers automatically on the tag push.

### 2. Manual re-trigger (for re-running a failed release)

GitHub → Actions → **Release — Stable** → Run workflow → enter the existing tag (e.g. `v1.2.3`).

The tag must already exist in the repo. The workflow re-uses the same GitHub Release and overwrites any previously uploaded checksums (`--clobber`).

---

## Publishing a preview release

### 1. Bump the version

```bash
npm version X.Y.Z-preview.N --no-git-tag-version
git add package.json
git commit -m "chore: bump version to X.Y.Z-preview.N"
git tag vX.Y.Z-preview.N
git push origin main
git push origin vX.Y.Z-preview.N
```

The `Release — Preview` workflow triggers automatically.

### 2. Manual re-trigger

GitHub → Actions → **Release — Preview** → Run workflow → enter the existing preview tag (e.g. `v1.2.3-preview.4`).

---

## Required secrets

| Secret | Used for | Status |
|--------|---------|--------|
| `GITHUB_TOKEN` | Creating/updating GitHub Releases, uploading assets | Automatically provided — no setup needed |
| `CSC_LINK` | macOS code-signing certificate (base64-encoded p12) | Pending — tracked by #45 |
| `CSC_KEY_PASSWORD` | macOS signing certificate password | Pending — tracked by #45 |
| `WIN_CSC_LINK` | Windows code-signing certificate | Pending — tracked by #45 |
| `WIN_CSC_KEY_PASSWORD` | Windows signing certificate password | Pending — tracked by #45 |
| `APPLE_ID` | macOS notarization Apple ID | Pending — tracked by #45 |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS notarization app-specific password | Pending — tracked by #45 |
| `APPLE_TEAM_ID` | macOS notarization team ID | Pending — tracked by #45 |

Signing and notarization secrets are **not required for the release workflow to run**. Unsigned builds are still produced and published; the signing/notarization gate is tracked separately by issue #45. When those secrets are added, electron-builder will pick them up from the environment automatically.

---

## Workflow stages

Each release workflow (stable or preview) runs these stages in order:

```
validate → verify → build-mac ┐
                    build-win  ├── (parallel)
                    build-linux┘
```

### Stage 1 — Validate

- Resolves the tag from the push event or `workflow_dispatch` input.
- Rejects misrouted tags: stable workflow rejects `-preview` tags; preview workflow rejects tags without `-preview`.
- Validates the exact tag format (`vX.Y.Z` or `vX.Y.Z-preview.N`).

### Stage 2 — Verify

- Checks out the tagged commit.
- Runs `pnpm run typecheck` (all TypeScript targets).
- Runs `pnpm run test` (Vitest unit tests).

### Stage 3 — Build & Publish (one job per platform)

Each platform job:
1. Checks out the tagged commit.
2. Installs dependencies (including native-module rebuild for Electron via postinstall).
3. Builds the renderer and main bundles with `electron-vite build`.
4. Packages and publishes artifacts to the GitHub Release with `electron-builder --publish always`.
5. Generates SHA-256 checksums with `pnpm run build:checksums`.
6. Uploads per-artifact `.sha256` sidecar files and a platform-scoped `checksums-<platform>.txt` to the GitHub Release.

---

## Artifact inventory

### Stable release (`vX.Y.Z`)

| Platform | Artifact | Purpose |
|----------|----------|---------|
| macOS    | `Pilog-X.Y.Z.dmg` | Installer |
| macOS    | `Pilog-X.Y.Z-mac.zip` | Auto-updater archive |
| macOS    | `latest-mac.yml` | Updater metadata |
| macOS    | `Pilog-X.Y.Z.dmg.sha256` | Checksum sidecar |
| macOS    | `Pilog-X.Y.Z-mac.zip.sha256` | Checksum sidecar |
| macOS    | `checksums-mac.txt` | Combined macOS checksums |
| Windows  | `Pilog-X.Y.Z-Setup.exe` | NSIS installer |
| Windows  | `latest.yml` | Updater metadata |
| Windows  | `Pilog-X.Y.Z-Setup.exe.sha256` | Checksum sidecar |
| Windows  | `checksums-win.txt` | Combined Windows checksums |
| Linux    | `Pilog-X.Y.Z.AppImage` | AppImage |
| Linux    | `Pilog-X.Y.Z.deb` | Debian package |
| Linux    | `Pilog-X.Y.Z.snap` | Snap package |
| Linux    | `latest-linux.yml` | Updater metadata |
| Linux    | `*.sha256` (per artifact) | Checksum sidecars |
| Linux    | `checksums-linux.txt` | Combined Linux checksums |

### Preview release (`vX.Y.Z-preview.N`)

Same set of artifacts with `-preview` embedded before the extension:
- `Pilog-X.Y.Z-preview.dmg`, `Pilog-X.Y.Z-preview-mac.zip`, `preview-mac.yml`, …
- `Pilog-X.Y.Z-preview-Setup.exe`, `preview.yml`, …
- `Pilog-X.Y.Z-preview.AppImage`, `Pilog-X.Y.Z-preview.deb`, `preview-linux.yml`, …

---

## Failure diagnosis

| Failing stage | What to check |
|--------------|---------------|
| Validate | Tag format in the push ref or `workflow_dispatch` input. Stable workflow rejects preview tags by design. |
| Verify — Typecheck | TypeScript errors in the workflow log. Fix and push a corrected commit, then re-tag. |
| Verify — Test | Failing Vitest tests in the log. |
| Build (electron-vite) | Compilation errors in the `Build app` step. |
| Publish (electron-builder) | Packaging errors, code-signing failures, or GitHub API upload errors. Check `GH_TOKEN` permissions (`contents: write`). Rate limits may require re-running the job. |
| Checksums | `pnpm run build:checksums` failure means no artifacts were found in `dist/`. The preceding publish step likely failed. |
| Checksum upload | `gh release upload` failure — the GitHub Release may not exist yet (publish step failed) or a network issue occurred. |

---

## Channel separation guarantee

- `electron-builder.yml` sets `channel: latest`, `releaseType: release`. electron-updater reads `latest.yml` / `latest-mac.yml` / `latest-linux.yml`.
- `electron-builder.preview.yml` extends the stable config and overrides `channel: preview`, `releaseType: prerelease`. electron-updater reads `preview.yml` / `preview-mac.yml` / `preview-linux.yml`.
- The stable workflow always uses the default config; the preview workflow always passes `--config electron-builder.preview.yml`.
- Stable installs never see preview metadata because `electron-updater` checks the channel configured at build time.
