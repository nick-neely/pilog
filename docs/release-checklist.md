# Release-Candidate Checklist

Use this checklist to verify a stable or preview release before calling it public. Work through each section on the platforms you have access to. macOS and Windows are V1 primary download platforms; Linux is a secondary/manual path.

References: [ADR-0006](adr/0006-release-distribution-architecture.md) · [release.md](release.md) · issues #46, #52, #54, #55, #56, #57, #58.

---

## Stable Release Checklist

### 1. CI pipeline

- [ ] `Release — Stable` workflow completed with all jobs green (validate, verify, build-mac, build-win, build-linux, publish-manifest, deploy-site).
- [ ] No unexpected job re-runs were required to reach a clean state.

### 2. GitHub Release artifacts

Open the GitHub Release for the tag (`vX.Y.Z`) and confirm:

- [ ] Stable release is marked as a **Release** (not pre-release).
- [ ] macOS: `Pilog-X.Y.Z.dmg`, `Pilog-X.Y.Z-mac.zip`, `latest-mac.yml`, `Pilog-X.Y.Z.dmg.sha256`, `Pilog-X.Y.Z-mac.zip.sha256`, `checksums-mac.txt` are present.
- [ ] Windows: `Pilog-X.Y.Z-Setup.exe`, `latest.yml`, `Pilog-X.Y.Z-Setup.exe.sha256`, `checksums-win.txt` are present.
- [ ] Linux: `Pilog-X.Y.Z.AppImage`, `Pilog-X.Y.Z.deb`, `Pilog-X.Y.Z.snap`, `latest-linux.yml`, per-artifact `.sha256` sidecars, `checksums-linux.txt` are present.
- [ ] No preview artifacts (`-preview` names) appear in this release.
- [ ] Updater metadata: download `latest-mac.yml` and confirm `version: X.Y.Z` and the `path` fields point to macOS artifacts. Repeat for `latest.yml` (Windows) and `latest-linux.yml` (Linux).

### 3. Release Manifest

- [ ] `site/src/data/release-manifest.json` on `main` has `"stable": { "version": "X.Y.Z", ... }` (not `null`).
- [ ] `stable.platforms` contains entries for `macos`, `windows`, and `linux`.
- [ ] All `downloadUrl` values resolve to the expected GitHub Release assets (spot-check two or three).

### 4. pilog.dev download page

- [ ] `pilog.dev/download` shows version `X.Y.Z` as the current stable release.
- [ ] Visiting on macOS: the hero CTA offers the DMG installer. The alternate-platform link is present.
- [ ] Visiting on Windows: the hero CTA offers the Setup.exe installer.
- [ ] The Linux section (secondary) lists AppImage and `.deb` with manual download links.
- [ ] Checksums for at least one artifact are visible or reachable from the download page.
- [ ] No preview caveat banner appears on the `/download` page.

### 5. macOS — Download and install

> **Public V1 Download (signed + notarized):** Complete steps 5a–5e only after signing and notarization are configured (tracked by #57).
>
> **Current state (unsigned):** macOS artifacts are unsigned. Skip notarization verification and expect Gatekeeper to block the DMG without manual override (`System Settings → Privacy & Security → Open Anyway`). Document that this is expected until #57 is complete.

- [ ] **5a. Download** the DMG from `pilog.dev/download` (not directly from GitHub Releases).
- [ ] **5b. Checksum** — verify the downloaded DMG:
  ```bash
  shasum -a 256 Pilog-X.Y.Z.dmg
  # Compare against Pilog-X.Y.Z.dmg.sha256 from the GitHub Release
  ```
- [ ] **5c. Mount and install** — open the DMG, drag Pilog to Applications.
- [ ] **5d. Gatekeeper (signed builds only)** — the app opens without a Gatekeeper warning. Confirm with:
  ```bash
  spctl --assess --type exec --verbose /Applications/Pilog.app
  # Expected: /Applications/Pilog.app: accepted
  ```
- [ ] **5e. Notarization (signed builds only)** — confirm the stapled ticket:
  ```bash
  stapler validate /Applications/Pilog.app
  # Expected: The validate action worked!
  ```
- [ ] **5f. App launches** — Pilog opens to the main interface without crash or error dialog.
- [ ] **5g. Version label** — open Settings → Software updates. The installed version shows `X.Y.Z` and the channel badge reads **Stable**.

### 6. Windows — Download and install

> **Public V1 Download (signed):** Complete steps 6a–6d only after Windows code signing is configured (tracked by #58).
>
> **Current state (unsigned):** Windows installers are unsigned. SmartScreen will block the installer with an "Unknown Publisher" warning. Click "More info → Run anyway" to proceed. Document that this is expected until #58 is complete.

- [ ] **6a. Download** the Setup.exe from `pilog.dev/download`.
- [ ] **6b. Checksum** — verify the installer:
  ```powershell
  Get-FileHash .\Pilog-X.Y.Z-Setup.exe -Algorithm SHA256
  # Compare against Pilog-X.Y.Z-Setup.exe.sha256 from the GitHub Release
  ```
- [ ] **6c. Signature (signed builds only)** — right-click the installer → Properties → Digital Signatures. Confirm the publisher is **Nick Neely** (or the configured signing entity) and the signature is valid. Or:
  ```powershell
  Get-AuthenticodeSignature .\Pilog-X.Y.Z-Setup.exe | Select-Object Status, SignerCertificate
  # Expected: Status = Valid
  ```
- [ ] **6d. Installed binary (signed builds only)** — after installation:
  ```powershell
  Get-AuthenticodeSignature "C:\Users\<you>\AppData\Local\Programs\Pilog\Pilog.exe" | Select-Object Status
  # Expected: Status = Valid
  ```
- [ ] **6e. App launches** — Pilog opens to the main interface.
- [ ] **6f. Version label** — Settings → Software updates shows `X.Y.Z` and channel badge reads **Stable**.

### 7. App verification (all platforms)

Perform these steps on each platform you have installed:

- [ ] **GitHub connection** — complete the GitHub sign-in flow (if not already authenticated). Verify the account name appears in the app.
- [ ] **Repository link** — link a local git repository to its GitHub remote. Confirm the repo appears in the repository list.
- [ ] **First note** — open the scratchpad and capture a note. Confirm it saves and appears in the inbox.
- [ ] **Draft generation** — select a note from the inbox and trigger draft generation. Confirm a draft is produced without error.
- [ ] **Update check** — Settings → Software updates → Check. With no newer stable release available, the status should read up-to-date (or offer the update if one was published after this build). It must not attempt to download a preview artifact.

### 8. Checksums spot-check

Pick one artifact per platform and verify its checksum independently:

```bash
# macOS (on macOS)
shasum -a 256 Pilog-X.Y.Z.dmg
cat Pilog-X.Y.Z.dmg.sha256   # must match

# Windows (on Windows/WSL)
sha256sum Pilog-X.Y.Z-Setup.exe
cat Pilog-X.Y.Z-Setup.exe.sha256   # must match

# Linux
sha256sum Pilog-X.Y.Z.AppImage
cat Pilog-X.Y.Z.AppImage.sha256    # must match
```

- [ ] macOS checksum verified.
- [ ] Windows checksum verified.
- [ ] Linux checksum verified (if testing Linux).

### 9. Clean-profile behavior

Test on a machine or user account with **no existing Pilog data** (or delete `~/Library/Application Support/pilog` on macOS, `%APPDATA%\pilog` on Windows):

- [ ] First launch does not crash or show an error about missing data.
- [ ] The setup/onboarding flow reaches a usable state (GitHub auth prompt or repository link prompt).
- [ ] A note can be captured and a draft generated in one clean session.

### 10. Stable separation from preview

- [ ] Installing the stable build and running an update check does not surface a preview release as an available update.
- [ ] `latest.yml` / `latest-mac.yml` / `latest-linux.yml` contain `X.Y.Z`, not a preview version string.

---

## Preview Release Checklist

### 1. CI pipeline

- [ ] `Release — Preview` workflow completed with all stages green.
- [ ] The GitHub Release is marked as a **Pre-release**.

### 2. GitHub Release artifacts (preview)

Open the GitHub Release for the tag (`vX.Y.Z-preview.N`) and confirm:

- [ ] macOS: `Pilog-X.Y.Z-preview.dmg`, `Pilog-X.Y.Z-preview-mac.zip`, `preview-mac.yml`.
- [ ] Windows: `Pilog-X.Y.Z-preview-Setup.exe`, `preview.yml`.
- [ ] Linux: `Pilog-X.Y.Z-preview.AppImage`, `Pilog-X.Y.Z-preview.deb`, `preview-linux.yml`.
- [ ] Per-artifact `.sha256` sidecars and `checksums-*.txt` files are present.
- [ ] No stable artifact names (without `-preview`) appear in this release.
- [ ] Updater metadata: download `preview-mac.yml` and confirm `version: X.Y.Z-preview.N` and `path` fields point to preview-named artifacts. Repeat for `preview.yml` and `preview-linux.yml`.

### 3. Release Manifest (preview channel)

- [ ] `site/src/data/release-manifest.json` on `main` has `"preview": { "version": "X.Y.Z-preview.N", ... }`.
- [ ] `stable` field is `null` or remains the last stable version — a preview release does not overwrite it.
- [ ] `preview.platforms` entries contain preview artifact names and URLs.

### 4. pilog.dev preview download page

- [ ] `pilog.dev/preview` shows `X.Y.Z-preview.N`.
- [ ] A **prominent caveat banner** is visible: the build is unsigned, may contain bugs, and data migration risk exists.
- [ ] The page does not masquerade as the main non-technical-user download path.
- [ ] `pilog.dev/download` (stable) is **not** updated to show the preview version.

### 5. macOS preview — Download and install

Preview macOS artifacts are **unsigned**. This is expected and must be stated in the caveat banner.

- [ ] Download the DMG from `pilog.dev/preview`.
- [ ] Verify checksum against the `.sha256` sidecar.
- [ ] Gatekeeper blocks the DMG. Override via System Settings → Privacy & Security → Open Anyway. This is expected and not a defect.
- [ ] App launches. The title bar or About dialog confirms this is a preview build.

### 6. Windows preview — Download and install

Preview Windows installers are **unsigned**. SmartScreen will show an "Unknown Publisher" warning.

- [ ] Download Setup.exe from `pilog.dev/preview`.
- [ ] Verify checksum against the `.sha256` sidecar.
- [ ] SmartScreen warns on launch. Click "More info → Run anyway". This is expected.
- [ ] App installs and launches.

### 7. Preview channel labeling

- [ ] Settings → Software updates shows version `X.Y.Z-preview.N` and the channel badge reads **Preview**.
- [ ] The channel label is visible in the installed version line (`Installed X.Y.Z-preview.N · Preview channel`).

### 8. Preview update metadata

- [ ] Settings → Software updates → Check. The updater reads `preview.yml` (not `latest.yml`). A preview-only update check should not discover a stable release as a newer version.
- [ ] If another preview release exists at a higher version, the updater offers it. If this is the latest preview, the status reads up-to-date.

### 9. Preview separation from stable downloads

- [ ] A stable install (if available for comparison) does not offer the preview version as an available update.
- [ ] `latest.yml` / `latest-mac.yml` / `latest-linux.yml` still point to the last stable version, not this preview.
- [ ] The `pilog.dev/download` page was not updated to show preview artifacts.

---

## Linux — Secondary / Manual Download

Linux is a secondary download platform for V1. Linux artifacts are available for manual download via GitHub Releases and the `pilog.dev/download` All Downloads section; they do not receive a hero CTA on the download page.

Linux artifacts are **unsigned** and will remain so for V1 (no Gatekeeper or SmartScreen equivalent applies on most distributions).

### Manual download verification

- [ ] AppImage: download from the GitHub Release, make executable, and launch:
  ```bash
  chmod +x Pilog-X.Y.Z.AppImage
  ./Pilog-X.Y.Z.AppImage
  ```
- [ ] `.deb`: install with `sudo dpkg -i Pilog-X.Y.Z.deb` and launch `pilog` from terminal or application launcher.
- [ ] Verify checksums:
  ```bash
  sha256sum Pilog-X.Y.Z.AppImage && cat Pilog-X.Y.Z.AppImage.sha256
  sha256sum Pilog-X.Y.Z.deb && cat Pilog-X.Y.Z.deb.sha256
  ```
- [ ] Version label in Settings shows the expected version and **Stable** (or **Preview**) channel.
- [ ] The Electron updater on Linux checks `latest-linux.yml` (stable) or `preview-linux.yml` (preview) and functions as expected.

Linux is explicitly out of scope for the first-class signed-download path. If Linux support expands to first-class status post-V1, revisit signing options (e.g., Snap Store signing) and update `pilog.dev` download page prominence accordingly.

---

## Signing / Notarization Status Reference

| Platform | Current state | Required for Public V1 Download | Tracked by |
|----------|--------------|----------------------------------|------------|
| macOS    | Unsigned      | Signing + notarization required  | #57        |
| Windows  | Unsigned      | Code signing required            | #58        |
| Linux    | Unsigned      | Not required (V1 secondary path) | —          |

Until #57 and #58 are complete, the stable download page should carry a note that builds are currently unsigned, and the preview download page must carry explicit unsigned caveats. Gatekeeper and SmartScreen bypass steps in this checklist reflect the current unsigned state and should be **removed** from future checklists once signing is wired.
