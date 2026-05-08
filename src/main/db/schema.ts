import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  repoId: text('repo_id'),
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
  githubUrl: text('github_url'),
  defaultBranch: text('default_branch'),
  autoPublishEnabled: integer('auto_publish_enabled', { mode: 'boolean' }).notNull().default(false),
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
  sourceNoteIds: text('source_note_ids').notNull().default('[]'),
  resultDraftIds: text('result_draft_ids').notNull().default('[]'),
  status: text('status', { enum: ['pending', 'running', 'completed', 'failed'] })
    .notNull()
    .default('pending'),
  errorMessage: text('error_message'),
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
