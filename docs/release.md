# Release Guide

## Overview

Pilog publishes stable and preview GitHub Releases through explicit Release Actions. Releases are **never** published on ordinary branch pushes or pull requests — only an intentional version tag push or a manual workflow dispatch triggers publishing.

This is per ADR-0006: GitHub Releases are the V1 canonical release/update source. `pilog.dev` reads a static Release Manifest over those artifacts rather than querying GitHub live.

---

## Channels

| Channel | Tag format         | GitHub Release type | Updater metadata file                                   |
| ------- | ------------------ | ------------------- | ------------------------------------------------------- |
| Stable  | `vX.Y.Z`           | Release (non-draft) | `latest.yml` / `latest-mac.yml` / `latest-linux.yml`    |
| Preview | `vX.Y.Z-preview.N` | Pre-release         | `preview.yml` / `preview-mac.yml` / `preview-linux.yml` |

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

| Secret                        | Used for                                            | Status                                   |
| ----------------------------- | --------------------------------------------------- | ---------------------------------------- |
| `GITHUB_TOKEN`                | Creating/updating GitHub Releases, uploading assets | Automatically provided — no setup needed |
| `VERCEL_TOKEN`                | Authenticating Vercel CLI for site deployments      | Must be added — see Vercel setup below   |
| `VERCEL_ORG_ID`               | Vercel team/org that owns the `pilog.dev` project   | Must be added — see Vercel setup below   |
| `VERCEL_PROJECT_ID`           | Vercel project ID for `pilog.dev`                   | Must be added — see Vercel setup below   |
| `CSC_LINK`                    | macOS code-signing certificate (base64-encoded p12) | Pending — tracked by #45                 |
| `CSC_KEY_PASSWORD`            | macOS signing certificate password                  | Pending — tracked by #45                 |
| `WIN_CSC_LINK`                | Windows code-signing certificate                    | Pending — tracked by #45                 |
| `WIN_CSC_KEY_PASSWORD`        | Windows signing certificate password                | Pending — tracked by #45                 |
| `APPLE_ID`                    | macOS notarization Apple ID                         | Pending — tracked by #45                 |
| `APPLE_APP_SPECIFIC_PASSWORD` | macOS notarization app-specific password            | Pending — tracked by #45                 |
| `APPLE_TEAM_ID`               | macOS notarization team ID                          | Pending — tracked by #45                 |

Signing and notarization secrets are **not required for the release workflow to run**. Unsigned builds are still produced and published; the signing/notarization gate is tracked separately by issue #45. When those secrets are added, electron-builder will pick them up from the environment automatically.

---

## Workflow stages

Each release workflow (stable or preview) runs these stages in order:

```
validate → verify → build-mac ┐
                    build-win  ├── publish-manifest → deploy-site
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

### Stage 4 — Publish Release Manifest

- Checks out `main` (not the tag) so the manifest commit lands on the default branch.
- Installs dependencies and runs `pnpm run generate:manifest` with the release tag and channel.
- Validates the updated manifest with `pnpm run test`.
- Commits and pushes `site/src/data/release-manifest.json` to `main`. If the manifest was already current, no commit is made.

### Stage 5 — Deploy Site to Vercel

- Checks out the latest `main` (which includes the manifest commit from Stage 4).
- Installs the Vercel CLI.
- Runs `vercel pull` to sync project settings from Vercel.
- Runs `vercel build --prod` to produce the `.vercel/output` artifact.
- Runs `vercel deploy --prebuilt --prod` to promote the build to Vercel Production.

Requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` to be set as GitHub Actions secrets (see Vercel setup below).

---

## Artifact inventory

### Stable release (`vX.Y.Z`)

| Platform | Artifact                       | Purpose                    |
| -------- | ------------------------------ | -------------------------- |
| macOS    | `Pilog-X.Y.Z.dmg`              | Installer                  |
| macOS    | `Pilog-X.Y.Z-mac.zip`          | Auto-updater archive       |
| macOS    | `latest-mac.yml`               | Updater metadata           |
| macOS    | `Pilog-X.Y.Z.dmg.sha256`       | Checksum sidecar           |
| macOS    | `Pilog-X.Y.Z-mac.zip.sha256`   | Checksum sidecar           |
| macOS    | `checksums-mac.txt`            | Combined macOS checksums   |
| Windows  | `Pilog-X.Y.Z-Setup.exe`        | NSIS installer             |
| Windows  | `latest.yml`                   | Updater metadata           |
| Windows  | `Pilog-X.Y.Z-Setup.exe.sha256` | Checksum sidecar           |
| Windows  | `checksums-win.txt`            | Combined Windows checksums |
| Linux    | `Pilog-X.Y.Z.AppImage`         | AppImage                   |
| Linux    | `Pilog-X.Y.Z.deb`              | Debian package             |
| Linux    | `Pilog-X.Y.Z.snap`             | Snap package               |
| Linux    | `latest-linux.yml`             | Updater metadata           |
| Linux    | `*.sha256` (per artifact)      | Checksum sidecars          |
| Linux    | `checksums-linux.txt`          | Combined Linux checksums   |

### Preview release (`vX.Y.Z-preview.N`)

Same set of artifacts with `-preview` embedded before the extension:

- `Pilog-X.Y.Z-preview.dmg`, `Pilog-X.Y.Z-preview-mac.zip`, `preview-mac.yml`, …
- `Pilog-X.Y.Z-preview-Setup.exe`, `preview.yml`, …
- `Pilog-X.Y.Z-preview.AppImage`, `Pilog-X.Y.Z-preview.deb`, `preview-linux.yml`, …

---

## Vercel setup

`pilog.dev` is deployed via the Vercel CLI in Stage 5. The site package lives in `site/` and `site/vercel.json` tells Vercel which framework to use.

### One-time project configuration

1. **Create the Vercel project** — Import the repository in the Vercel dashboard. Set **Root Directory** to `site/`. Vercel will auto-detect Next.js from `site/vercel.json`.
2. **Link the domain** — Add `pilog.dev` as a custom domain in the Vercel project settings.
3. **Retrieve project IDs** — From the Vercel dashboard (Project → Settings → General), copy the **Team ID** (or personal account ID) and **Project ID**.
4. **Create a Vercel token** — Account → Settings → Tokens → create a token with scope limited to the `pilog.dev` project.
5. **Add GitHub secrets** — In the GitHub repository (Settings → Secrets and variables → Actions), add:
   - `VERCEL_TOKEN` — the token created above
   - `VERCEL_ORG_ID` — the Vercel team/account ID
   - `VERCEL_PROJECT_ID` — the Vercel project ID

These values are never committed to source. The `site/vercel.json` file contains only non-secret framework configuration.

### Preview deployments

Vercel's GitHub integration auto-deploys every branch push and pull request to a preview URL without publishing desktop releases. No extra configuration is required — preview deployments happen on all branches, while production deployments are reserved for the Release Actions.

### Inspecting a production deployment

```bash
# List recent deployments for the project
vercel ls --prod --token "$VERCEL_TOKEN"

# Open the Vercel dashboard for the project
open https://vercel.com/<team>/<project>
```

The Vercel dashboard (Deployments tab) shows every deployment with its status, build logs, and the git commit it was built from.

### Rolling back a deployment

To revert `pilog.dev` to a previous deployment:

1. In the Vercel dashboard, open the Deployments tab.
2. Find the last known-good deployment.
3. Click the three-dot menu → **Promote to Production**.

Or with the CLI:

```bash
# List recent deployments and find the deployment URL to revert to
vercel ls --prod --token "$VERCEL_TOKEN"

# Promote a previous deployment URL to production
vercel promote <deployment-url> --token "$VERCEL_TOKEN"
```

### Manually redeploying

To redeploy the current `main` branch without pushing a new release:

```bash
cd site
vercel pull --yes --environment=production --token "$VERCEL_TOKEN"
vercel build --prod --token "$VERCEL_TOKEN"
vercel deploy --prebuilt --prod --token "$VERCEL_TOKEN"
```

Or trigger a re-run of the release workflow via GitHub → Actions → **Release — Stable** (or Preview) → Run workflow → enter the existing tag.

---

## Failure diagnosis

| Failing stage              | What to check                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validate                   | Tag format in the push ref or `workflow_dispatch` input. Stable workflow rejects preview tags by design.                                                                   |
| Verify — Typecheck         | TypeScript errors in the workflow log. Fix and push a corrected commit, then re-tag.                                                                                       |
| Verify — Test              | Failing Vitest tests in the log.                                                                                                                                           |
| Build (electron-vite)      | Compilation errors in the `Build app` step.                                                                                                                                |
| Publish (electron-builder) | Packaging errors, code-signing failures, or GitHub API upload errors. Check `GH_TOKEN` permissions (`contents: write`). Rate limits may require re-running the job.        |
| Checksums                  | `pnpm run build:checksums` failure means no artifacts were found in `dist/`. The preceding publish step likely failed.                                                     |
| Checksum upload            | `gh release upload` failure — the GitHub Release may not exist yet (publish step failed) or a network issue occurred.                                                      |
| Publish manifest           | `generate:manifest` script failure or manifest validation failure. Check the manifest script logs for missing release assets.                                              |
| Deploy site                | `vercel` CLI failure. Verify that `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` secrets are set in the repository. Check the Vercel dashboard for build errors. |

---

## Release handoff

This section describes how the five pipeline stages connect GitHub Release artifacts to the installed app experience and to `pilog.dev`. A successful release touches all of these handoff points. Understanding them lets a maintainer verify each independently if something looks wrong after a release.

### Handoff map

```
Tag push / workflow_dispatch
        │
        ▼
┌───────────────┐
│  Stage 1–2    │  validate + typecheck + test
│  Validate /   │
│  Verify       │
└──────┬────────┘
       │ tag + version passed downstream
       ▼
┌──────────────────────────────────────────────────────────┐
│  Stage 3 — Build & Publish (macOS / Windows / Linux)     │
│                                                          │
│  electron-builder packages the app and publishes:        │
│    • installer artifacts (DMG, Setup.exe, AppImage, deb) │
│    • Electron updater metadata (latest.yml, etc.)         │
│    • per-artifact .sha256 sidecars + checksums-*.txt      │
│  → GitHub Release assets for the tag                     │
└──────┬───────────────────────────────────────────────────┘
       │ all three build jobs succeeded
       ▼
┌──────────────────────────────────────────────────────────┐
│  Stage 4 — Publish Release Manifest                      │
│                                                          │
│  generate-release-manifest.ts reads the GitHub Release   │
│  asset list, builds the updated manifest, and commits    │
│  site/src/data/release-manifest.json to main.            │
│  → release-manifest.json is the static index that        │
│    pilog.dev reads instead of querying GitHub live.       │
└──────┬───────────────────────────────────────────────────┘
       │ manifest committed to main
       ▼
┌──────────────────────────────────────────────────────────┐
│  Stage 5 — Deploy Site                                   │
│                                                          │
│  Vercel CLI builds and promotes the site package         │
│  (site/) from the updated main branch.                   │
│  → pilog.dev download page reflects the new release.     │
└──────────────────────────────────────────────────────────┘
```

### Handoff points in detail

**GitHub Release → Electron updater**

electron-builder publishes `latest.yml` / `latest-mac.yml` / `latest-linux.yml` (stable) or `preview.yml` / `preview-mac.yml` / `preview-linux.yml` (preview) as GitHub Release assets. Installed copies of Pilog check the appropriate metadata file from GitHub Releases via `electron-updater`. The channel is baked into the build at packaging time; a stable install never reads preview metadata.

**GitHub Release → Release Manifest**

`scripts/generate-release-manifest.ts` fetches the GitHub Release asset list for the tag, maps artifact filenames to platforms and download URLs, and writes the structured manifest to `site/src/data/release-manifest.json`. This is a repo-versioned static file; `pilog.dev` imports it at build time and requires no live GitHub API calls. See ADR-0006.

**Release Manifest → pilog.dev download pages**

`site/src/app/download/page.tsx` (stable) and `site/src/app/preview/page.tsx` (preview) import the manifest. The `PlatformDownload` and `PreviewDownload` components detect the visitor's OS and surface the matching artifact as the primary CTA. Checksums and alternate platform downloads are also derived from the manifest. Changes to the manifest shape must be reflected in the manifest schema and these components.

**Vercel deployment → live pilog.dev**

Stage 5 runs `vercel pull → vercel build --prod → vercel deploy --prebuilt --prod` against the Vercel project linked to `pilog.dev`. The build always targets the current `main` branch, which includes the manifest commit from Stage 4. A production deployment URL is returned and logged in the workflow run. The Vercel dashboard (Deployments tab) is the canonical source of truth for which commit is live.

**Signing/notarization → trust posture**

macOS DMG and Windows Setup.exe artifacts are currently **unsigned** (tracked by #57 and #58). Unsigned artifacts are suitable for preview downloads with explicit caveats. Public V1 Stable downloads require macOS signing + notarization (Apple Developer Program, `CSC_LINK`, `APPLE_ID`, `APPLE_TEAM_ID`) and Windows signing (`WIN_CSC_LINK`). When those secrets are configured, electron-builder picks them up automatically. The required secrets table above lists all signing secrets and their status.

### What to verify after a release

After any tag push runs to completion:

1. **GitHub Release** — confirm the expected artifacts, updater metadata files, and `.sha256` sidecars appear on the Releases page for the tag.
2. **Release Manifest** — confirm `site/src/data/release-manifest.json` on `main` contains the new version in the expected channel (`stable` or `preview`).
3. **pilog.dev** — confirm the live site download page shows the new version. The Vercel dashboard (Deployments) shows which commit is live and any build errors.
4. **Updater metadata** — download the appropriate `*.yml` file from the GitHub Release and verify `version`, `path`, and `sha512` fields match published artifacts.
5. **Checksums** — cross-check one artifact against its `.sha256` sidecar.

The full release-candidate checklist lives in `docs/release-checklist.md`.

---

## Channel separation guarantee

- `electron-builder.yml` sets `channel: latest`, `releaseType: release`. electron-updater reads `latest.yml` / `latest-mac.yml` / `latest-linux.yml`.
- `electron-builder.preview.yml` extends the stable config and overrides `channel: preview`, `releaseType: prerelease`. electron-updater reads `preview.yml` / `preview-mac.yml` / `preview-linux.yml`.
- The stable workflow always uses the default config; the preview workflow always passes `--config electron-builder.preview.yml`.
- Stable installs never see preview metadata because `electron-updater` checks the channel configured at build time.
