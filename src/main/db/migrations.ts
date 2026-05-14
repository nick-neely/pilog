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
      access_kind TEXT NOT NULL DEFAULT 'host',
      wsl_distro TEXT,
      wsl_path TEXT,
      github_url TEXT,
      default_branch TEXT,
      github_labels TEXT NOT NULL DEFAULT '[]',
      github_labels_synced_at TEXT,
      auto_publish_enabled INTEGER NOT NULL DEFAULT 0,
      auto_publish_max_issues_per_run INTEGER NOT NULL DEFAULT 5,
      auto_publish_default_label TEXT NOT NULL DEFAULT 'triaged-by-pilog',
      auto_publish_dry_run INTEGER NOT NULL DEFAULT 0,
      auto_publish_require_confirmation INTEGER NOT NULL DEFAULT 1,
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
      grouping_reason TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      github_issue_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS repo_indices (
      repo_id TEXT PRIMARY KEY REFERENCES repos(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      index_version INTEGER NOT NULL,
      last_indexed_at TEXT,
      package_manager TEXT,
      framework_signals TEXT NOT NULL DEFAULT '[]',
      important_directories TEXT NOT NULL DEFAULT '[]',
      exclusion_summary TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  db.run(sql`
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      repo_id TEXT REFERENCES repos(id),
      input_note_ids TEXT NOT NULL DEFAULT '[]',
      output_draft_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'running',
      error_message TEXT,
      error_cause TEXT,
      event_stream TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)

  addColumnIfMissing(db, 'notes', 'run_id', 'TEXT')
  addColumnIfMissing(db, 'repos', 'access_kind', "TEXT NOT NULL DEFAULT 'host'")
  addColumnIfMissing(db, 'repos', 'wsl_distro', 'TEXT')
  addColumnIfMissing(db, 'repos', 'wsl_path', 'TEXT')
  addColumnIfMissing(db, 'repos', 'auto_publish_enabled', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing(db, 'repos', 'github_labels', "TEXT NOT NULL DEFAULT '[]'")
  addColumnIfMissing(db, 'repos', 'github_labels_synced_at', 'TEXT')
  addColumnIfMissing(db, 'repos', 'auto_publish_max_issues_per_run', 'INTEGER NOT NULL DEFAULT 5')
  addColumnIfMissing(
    db,
    'repos',
    'auto_publish_default_label',
    "TEXT NOT NULL DEFAULT 'triaged-by-pilog'"
  )
  addColumnIfMissing(db, 'repos', 'auto_publish_dry_run', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing(db, 'repos', 'auto_publish_require_confirmation', 'INTEGER NOT NULL DEFAULT 1')
  addColumnIfMissing(db, 'issue_drafts', 'grouping_reason', "TEXT NOT NULL DEFAULT ''")
  addColumnIfMissing(db, 'agent_runs', 'input_note_ids', "TEXT NOT NULL DEFAULT '[]'")
  addColumnIfMissing(db, 'agent_runs', 'output_draft_ids', "TEXT NOT NULL DEFAULT '[]'")
  addColumnIfMissing(db, 'agent_runs', 'error_cause', 'TEXT')
  addColumnIfMissing(db, 'agent_runs', 'event_stream', "TEXT NOT NULL DEFAULT '[]'")
  addColumnIfMissing(db, 'agent_runs', 'started_at', 'TEXT')
  addColumnIfMissing(db, 'agent_runs', 'finished_at', 'TEXT')

  if (hasColumn(db, 'agent_runs', 'source_note_ids')) {
    db.run(sql`
      UPDATE agent_runs
      SET input_note_ids = COALESCE(NULLIF(input_note_ids, '[]'), source_note_ids, '[]')
    `)
  }

  if (hasColumn(db, 'agent_runs', 'result_draft_ids')) {
    db.run(sql`
      UPDATE agent_runs
      SET output_draft_ids = COALESCE(NULLIF(output_draft_ids, '[]'), result_draft_ids, '[]')
    `)
  }

  db.run(sql`
    UPDATE agent_runs
    SET
      started_at = COALESCE(started_at, created_at),
      status = CASE
        WHEN status = 'completed' THEN 'succeeded'
        WHEN status = 'pending' THEN 'running'
        ELSE status
      END
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
  const cols = db.all(sql`PRAGMA table_info(publish_log)`) as Array<{
    name: string
    notnull: number
  }>
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

function addColumnIfMissing(
  db: PilogDatabase,
  table: string,
  column: string,
  definition: string
): void {
  const cols = db.all(sql.raw(`PRAGMA table_info(${table})`)) as Array<{ name: string }>
  if (cols.some((c) => c.name === column)) return
  db.run(sql.raw(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`))
}

function hasColumn(db: PilogDatabase, table: string, column: string): boolean {
  const cols = db.all(sql.raw(`PRAGMA table_info(${table})`)) as Array<{ name: string }>
  return cols.some((c) => c.name === column)
}
