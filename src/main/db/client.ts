import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export type PilogDatabase = ReturnType<typeof drizzle<typeof schema>>

export function createDatabase(sqlitePath: string): PilogDatabase {
  const sqlite = new Database(sqlitePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}

export function createInMemoryDatabase(): PilogDatabase {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  return drizzle(sqlite, { schema })
}
