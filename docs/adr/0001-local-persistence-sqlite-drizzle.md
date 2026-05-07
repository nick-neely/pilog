# ADR 0001: Local Persistence with SQLite + Drizzle

## Status

Accepted

## Context

PiLog needs local-first persistence for notes, issue drafts, repositories, agent runs, publish history, and settings. The app runs inside Electron on Node.js.

Options considered:

1. **better-sqlite3 + Drizzle ORM** – synchronous SQLite driver purpose-built for Node, paired with a typed schema/query layer.
2. **bun:sqlite** – Bun-native SQLite. Incompatible because Electron's main process runs on Node, not Bun.
3. **Turso / libSQL** – cloud-sync-capable SQLite. Unnecessary complexity for an MVP that is local-only.
4. **JSON files** – simple but lacks queries, migrations, and concurrent-write safety.

## Decision

Use **better-sqlite3** as the SQLite driver and **Drizzle ORM** for schema definition and queries.

- The database file lives at `app.getPath('userData')/pilog.sqlite`.
- WAL mode is enabled for performance.
- Foreign keys are enforced.
- Migrations are defined as idempotent SQL (`CREATE TABLE IF NOT EXISTS`) run on app start.
- The full Phase 1–4 schema (notes, repos, issue_drafts, agent_runs, publish_log, settings) is committed in the initial migration so table shapes are stable from day one.

## Consequences

- All persistence logic stays in the Electron main process; the renderer never touches the DB directly.
- Drizzle provides compile-time type safety for queries.
- better-sqlite3 requires a native rebuild for Electron. Runtime native dependencies live under `app/` so Electron rebuilds do not mutate the root Node dependency tree used by Vitest and other tooling.
- Migration to Turso/libSQL later is straightforward since Drizzle abstracts the driver.
