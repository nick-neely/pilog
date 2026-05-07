# ADR-0002: Window Architecture

## Status

Accepted

## Context

PiLog needs at least two distinct surfaces: the **inbox** (a full main window for triaging notes) and the **scratchpad** (a small, frameless, always-on-top capture overlay). Future slices will add a system tray and possibly a settings window. We need to decide how these map to Electron's `BrowserWindow` abstraction.

### Options considered

1. **Single window, in-app routing** — One `BrowserWindow`; render scratchpad as an overlay or route. Simpler build, but the scratchpad cannot be `alwaysOnTop` independently, and the capture UX suffers because it is tied to the main window's lifecycle and z-order.

2. **Multiple `BrowserWindow` instances** — Separate windows for inbox and scratchpad. Each can have its own frame, size, and `alwaysOnTop` policy. Requires a multi-page renderer build and IPC-based coordination between windows.

3. **`BrowserView` / `WebContentsView`** — Embed views inside a single shell window. Gives some layout flexibility but does not solve the z-order problem and adds API complexity for little gain at this stage.

## Decision

**Option 2 — multiple `BrowserWindow` instances.**

- The **main window** renders the inbox (and later, settings/review screens) as a standard framed window.
- The **scratchpad window** is frameless, always-on-top, ~480×360, centered on the active display. It is created once and hidden/shown rather than destroyed, so re-open latency stays under 200 ms. On re-show the editor state is reset via a `scratchpad:reset` push event.
- Both windows share a single preload script (`src/preload/index.ts`) exposing the typed `window.pilog` bridge.
- The renderer build uses `electron-vite`'s multi-page input (`index.html` + `scratchpad.html`) so each window loads its own React entry point.
- A `scratchpad:hide` one-way IPC action lets the scratchpad renderer request the main process to hide its own window.
- A `note:created` push event from main to all windows allows the inbox to refresh when the scratchpad creates a note.

## Amendment: Tray-Driven Lifecycle (Issue #4)

The app now boots into the system tray by default. The tray is the primary entry point; the main window is no longer shown automatically on launch unless `settings.openInboxAtLogin` is `'true'`.

### Tray menu

| Item | Action |
|------|--------|
| Open Inbox | Show/focus the main window on the inbox route |
| New Note | Open/focus the scratchpad (same code path as hotkey) |
| Settings | Show/focus the main window on the settings route |
| Quit | `app.quit()` — the only way to terminate the process |

### Window lifecycle

- **Main window** hides on close (`close` event is intercepted with `preventDefault()` + `hide()`). This keeps the process alive and makes re-open instant.
- **`window-all-closed`** is a no-op — the tray keeps the app alive on all platforms.
- **`before-quit`** force-destroys all windows so the process can exit cleanly.
- **Navigation** between inbox and settings happens via `navigate:inbox` / `navigate:settings` IPC events sent from main to renderer. The renderer uses simple state-based routing (no external router library).

## Consequences

- Each new window surface requires an HTML entry point and a React root, adding a small build-config cost.
- Cross-window communication goes through the main process (IPC), not direct window-to-window messaging. This is consistent with ADR-0003's "main process owns the truth" principle.
- The tray calls the same `openScratchpad()` / `showMainWindow()` functions as the menu and hotkeys.
