import { sql } from 'drizzle-orm'
import type { PilogDatabase } from './client'

export function runMigrations(db: PilogDatabase): void {
  db.run(sql`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      repo_id TEXT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unprocessed',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS repos (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      local_path TEXT NOT NULL,
      github_url TEXT,
      default_branch TEXT,
      auto_publish_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS issue_drafts (
      id TEXT PRIMARY KEY,
      repo_id TEXT NOT NULL REFERENCES repos(id),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      labels TEXT NOT NULL DEFAULT '[]',
      source_note_ids TEXT NOT NULL DEFAULT '[]',
      affected_files_json TEXT NOT NULL DEFAULT '[]',
      confidence TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'draft',
      github_issue_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      repo_id TEXT REFERENCES repos(id),
      source_note_ids TEXT NOT NULL DEFAULT '[]',
      result_draft_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS publish_log (
      id TEXT PRIMARY KEY,
      draft_id TEXT REFERENCES issue_drafts(id),
      repo_id TEXT NOT NULL REFERENCES repos(id),
      github_issue_url TEXT NOT NULL,
      published_at TEXT NOT NULL
    )
  `)

  // If draft_id was previously NOT NULL, recreate the table to allow null
  // (needed for hand-written issues that have no parent issue_draft)
  const cols = db.all(
    sql`PRAGMA table_info(publish_log)`
  ) as Array<{ name: string; notnull: number }>
  const draftIdCol = cols.find((c) => c.name === 'draft_id')
  if (draftIdCol && draftIdCol.notnull === 1) {
    db.run(sql`ALTER TABLE publish_log RENAME TO publish_log_old`)
    db.run(sql`
      CREATE TABLE publish_log (
        id TEXT PRIMARY KEY,
        draft_id TEXT REFERENCES issue_drafts(id),
        repo_id TEXT NOT NULL REFERENCES repos(id),
        github_issue_url TEXT NOT NULL,
        published_at TEXT NOT NULL
      )
    `)
    db.run(sql`INSERT INTO publish_log SELECT * FROM publish_log_old`)
    db.run(sql`DROP TABLE publish_log_old`)
  }

  db.run(sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
}
