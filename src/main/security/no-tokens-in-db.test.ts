import { describe, it, expect } from 'vitest'
import { createInMemoryDatabase } from '../db/client'
import { runMigrations } from '../db/migrations'
import { sql } from 'drizzle-orm'

describe('database schema security', () => {
  it('does not contain columns that could store tokens or secrets', () => {
    const db = createInMemoryDatabase()
    runMigrations(db)

    const tables = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
    )

    const forbiddenPatterns = /token|secret|api_key|password|credential|access_key/i

    for (const table of tables) {
      const columns = db.all<{ name: string }>(sql.raw(`PRAGMA table_info('${table.name}')`))

      for (const col of columns) {
        expect(
          forbiddenPatterns.test(col.name),
          `Column "${table.name}.${col.name}" looks like it stores secrets — tokens must use safeStorage, not SQLite`
        ).toBe(false)
      }
    }
  })
})
