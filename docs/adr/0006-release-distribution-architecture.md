# ADR 0006: Release Distribution Architecture

## Status

Accepted (2026-05-10)

## Context

Pilog is an open-source Electron app, but GitHub Releases are not the right first-touch install experience for most users. `pilog.dev` should provide the friendly download and docs entry point, while GitHub Releases remain the public artifact archive and power-user path.

The release system must serve two different jobs without blurring them:

- **First install**: a user visits `pilog.dev`, gets the right installer for their platform, and can inspect other platform downloads.
- **Installed updates**: an installed Pilog app checks a configured update channel and offers check/download/restart states without interrupting capture work.

Issues #41 and #46 split that work: #41 owns the in-app update channel and states; #46 owns the public download path and release handoff.

## Decision

For V1, Pilog uses **GitHub Releases as the Canonical Release Source** and `pilog.dev` as the **Public Download Path** over those release artifacts. The website is release/distribution infrastructure first and marketing site second.

The website code lives in this repository as a small **Site Package** beside the existing Electron app, without reorganizing the app into a full `apps/desktop` monorepo layout for V1. A future monorepo layout remains desirable once the site/release boundary is proven.

Public releases are produced only by an explicit **Release Action**: a manual workflow dispatch or `vX.Y.Z` tag. Ordinary pushes and pull requests run verification, but do not publish public desktop releases.

The Release Action produces:

- desktop artifacts for the supported platforms
- GitHub Release assets
- Electron updater metadata
- checksums or equivalent integrity metadata
- a repo-versioned **Release Manifest** consumed by `pilog.dev`
- a production `pilog.dev` deployment after the manifest is updated

The Release Manifest is a static JSON index deployed with the Vercel site. The site reads that manifest instead of scraping or querying GitHub live for every render. GitHub still hosts the canonical artifacts for V1; the manifest is the site-friendly index over them.

For V1, macOS and Windows are the primary **Supported Download Platforms** on `pilog.dev`. Linux artifacts may be available through secondary/manual downloads and can become first-class after V1.

The polished **Public V1 Download** experience requires a credible trust posture for macOS and Windows: macOS signing/notarization and Windows signing. Before those account/certificate decisions are complete, `pilog.dev` may expose a clearly labeled **Preview Download** page for early builds with explicit caveats. Preview downloads must not masquerade as the main non-technical-user download path.

Pilog has two **App Update Channels** for V1:

- Stable builds consume stable GitHub Release updater metadata.
- Preview builds consume a separate preview channel.

The channel is determined by the installed build. In-app channel switching is a later power-user feature, not V1 scope. The app should label its current version and channel in-app, especially for preview builds.

## Consequences

### Positive

- `pilog.dev` can give non-technical users a simple platform-aware download flow without making GitHub Releases disappear.
- The release artifact host, updater metadata, checksums, website download links, and release docs all stay tied to one explicit versioned release event.
- The website does not depend on GitHub API availability or filename scraping at request time.
- Vercel deployment stays simple: the site deploys static content from the repo, including the current Release Manifest.
- Preview users can receive preview updates without exposing prerelease artifacts to stable installs.
- The repo avoids a broad layout migration before V1 while keeping the path open to a future monorepo.

### Negative / accepted costs

- The Release Action needs discipline: artifact naming, checksums, updater metadata, manifest generation, GitHub Release publishing, and Vercel deployment must succeed as one coherent pipeline.
- A repo-versioned manifest may create release commits. Workflows must avoid loops by making publishing tag/manual-dispatch driven rather than push-to-main driven.
- GitHub Releases remain visible in normal download URLs for V1. This is acceptable for a developer-focused open-source app.
- Public V1 macOS/Windows downloads are gated by signing/notarization costs and certificate/account setup.
- Build-determined update channels are simpler but less flexible than an in-app beta/stable switcher.

## Rejected alternatives

- **Separate website repository for V1.** Rejected because `pilog.dev` is currently release/distribution infrastructure, not an independent web product. Keeping it in the app repo keeps release links, manifest shape, docs, and artifacts synchronized.
- **Full monorepo reorganization before V1.** Rejected as unnecessary churn. A `site/` package beside the existing Electron layout is enough for the first public distribution path.
- **Publishing on every push to `main`.** Rejected because desktop installers, signing/notarization, checksums, and updater metadata need an intentional versioned release gate.
- **Live GitHub API reads from the download page.** Rejected because the public download UI should be deterministic and static-friendly. The Release Manifest is the stable handoff from release automation to the site.
- **`pilog.dev` generic update feed for V1.** Rejected as premature. GitHub Releases are coherent for a developer-focused open-source tool; a generic `pilog.dev` feed can be introduced later if staged rollouts, analytics, CDN control, or URL hiding become important.
- **One update channel for preview and stable.** Rejected because prerelease artifacts must never leak into stable installs.
- **In-app channel switching for V1.** Rejected to keep #41 focused on reliable update checks, download/restart states, failure recovery, and version/channel labeling.

## Downstream issue impacts

- **#41** — owns `electron-updater` provider setup against GitHub Releases, packaged-build-only checks, typed IPC, Settings update states, failure recovery, stable/preview channel separation, and in-app version/channel labeling.
- **#45** — remains the public V1 gate for macOS notarization/signing and Windows signing. Preview downloads may exist before #45 is fully complete, but must carry caveats.
- **#46** — owns the `pilog.dev` Public Download Path, platform-aware download UI, Release Manifest consumption, checksums/integrity display, GitHub Release handoff, and release-candidate checklist.
