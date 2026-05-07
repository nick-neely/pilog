# ADR 0003: Typed IPC Contract

## Status

Accepted

## Context

Electron's IPC (`ipcMain.handle` / `ipcRenderer.invoke`) is stringly-typed by default. A typo in a channel name or a mismatched payload shape produces runtime errors with no compile-time feedback.

Options considered:

1. **Typed contract object in `src/shared/ipc.ts`** – a single `IpcContract` type maps channel names to request/response pairs. Main-process handlers and the preload bridge are both typed against it.
2. **Code-generated RPC** – tools like `electron-trpc` add a full tRPC layer. Heavy for an MVP.
3. **Manual per-channel typing** – each handler and caller typed independently. Drift-prone.

## Decision

Define a single `IpcContract` type in `src/shared/ipc.ts`:

```ts
export type IpcContract = {
  'note:create': { request: { content: string }; response: Note }
  'note:list':   { request: void; response: Note[] }
}
```

- The main-process handler registry (`src/main/ipc/handlers.ts`) is typed against `IpcContract`, so adding a channel requires both a type entry and a handler implementation.
- The preload script exposes a single `window.pilog` object with an `invoke` method typed as `<C extends IpcChannel>(channel: C, request?: IpcRequest<C>) => Promise<IpcResponse<C>>`.
- No raw `ipcRenderer` is exposed to the renderer; all IPC flows through the `pilog` bridge.

## Consequences

- Adding a new IPC channel is a three-step process: (1) add the type to `IpcContract`, (2) add the handler, (3) use it in the renderer — all type-checked.
- The renderer never imports Electron directly; it only sees `window.pilog`.
- The contract file is shared between main and renderer via the `@shared` path alias.
- Trade-off: no streaming or push channels yet. This can be added later with a separate event contract if needed.
