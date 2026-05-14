import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  repoId: text('repo_id'),
  runId: text('run_id'),
  content: text('content').notNull(),
  status: text('status', { enum: ['unprocessed', 'drafted', 'published', 'dismissed'] })
    .notNull()
    .default('unprocessed'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  owner: text('owner').notNull(),
  localPath: text('local_path').notNull(),
  accessKind: text('access_kind', { enum: ['host', 'wsl'] })
    .notNull()
    .default('host'),
  wslDistro: text('wsl_distro'),
  wslPath: text('wsl_path'),
  githubUrl: text('github_url'),
  defaultBranch: text('default_branch'),
  githubLabels: text('github_labels').notNull().default('[]'),
  githubLabelsSyncedAt: text('github_labels_synced_at'),
  autoPublishEnabled: integer('auto_publish_enabled', { mode: 'boolean' }).notNull().default(false),
  autoPublishMaxIssuesPerRun: integer('auto_publish_max_issues_per_run').notNull().default(5),
  autoPublishDefaultLabel: text('auto_publish_default_label').notNull().default('triaged-by-pilog'),
  autoPublishDryRun: integer('auto_publish_dry_run', { mode: 'boolean' }).notNull().default(false),
  autoPublishRequireConfirmation: integer('auto_publish_require_confirmation', { mode: 'boolean' })
    .notNull()
    .default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const repoIndices = sqliteTable('repo_indices', {
  repoId: text('repo_id')
    .primaryKey()
    .references(() => repos.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['ready', 'failed'] }).notNull(),
  indexVersion: integer('index_version').notNull(),
  lastIndexedAt: text('last_indexed_at'),
  packageManager: text('package_manager'),
  frameworkSignals: text('framework_signals').notNull().default('[]'),
  importantDirectories: text('important_directories').notNull().default('[]'),
  exclusionSummary: text('exclusion_summary').notNull().default('{}'),
  errorMessage: text('error_message'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const issueDrafts = sqliteTable('issue_drafts', {
  id: text('id').primaryKey(),
  repoId: text('repo_id')
    .notNull()
    .references(() => repos.id),
  title: text('title').notNull(),
  body: text('body').notNull(),
  labels: text('labels').notNull().default('[]'),
  sourceNoteIds: text('source_note_ids').notNull().default('[]'),
  affectedFilesJson: text('affected_files_json').notNull().default('[]'),
  confidence: text('confidence', { enum: ['low', 'medium', 'high'] })
    .notNull()
    .default('medium'),
  groupingReason: text('grouping_reason').notNull().default(''),
  workflowState: text('workflow_state', { enum: ['ready', 'needs_clarification'] })
    .notNull()
    .default('ready'),
  clarificationQuestions: text('clarification_questions').notNull().default('[]'),
  status: text('status', { enum: ['draft', 'published', 'dismissed'] })
    .notNull()
    .default('draft'),
  githubIssueUrl: text('github_issue_url'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const agentRuns = sqliteTable('agent_runs', {
  id: text('id').primaryKey(),
  repoId: text('repo_id').references(() => repos.id),
  inputNoteIds: text('input_note_ids').notNull().default('[]'),
  outputDraftIds: text('output_draft_ids').notNull().default('[]'),
  status: text('status', { enum: ['running', 'succeeded', 'failed', 'cancelled'] })
    .notNull()
    .default('running'),
  errorMessage: text('error_message'),
  errorCause: text('error_cause'),
  eventStream: text('event_stream').notNull().default('[]'),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

export const publishLog = sqliteTable('publish_log', {
  id: text('id').primaryKey(),
  draftId: text('draft_id').references(() => issueDrafts.id),
  repoId: text('repo_id')
    .notNull()
    .references(() => repos.id),
  githubIssueUrl: text('github_issue_url').notNull(),
  publishedAt: text('published_at').notNull()
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
