/**
 * SQLite Database Singleton via Drizzle ORM
 *
 * Zero-config: defaults to ./data/platform.db
 * Override with DATABASE_URL env var.
 */

import { mkdirSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ─── Schema ──────────────────────────────────────────────────────────────────

export const usersTable = sqliteTable('users', {
  id:           text('id').primaryKey(),
  email:        text('email').notNull().unique(),
  name:         text('name').notNull(),
  role:         text('role').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:    integer('updated_at', { mode: 'timestamp' }).notNull(),
  lastLoginAt:  integer('last_login_at', { mode: 'timestamp' }),
});

export const agentsTable = sqliteTable('agents', {
  id:               text('id').primaryKey(),
  name:             text('name').notNull(),
  apiKeyHash:       text('api_key_hash').notNull(),
  active:           integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt:        integer('created_at', { mode: 'timestamp' }).notNull(),
  lastUsedAt:       integer('last_used_at', { mode: 'timestamp' }).notNull(),
  requestCount:     integer('request_count').notNull().default(0),
  rateLimitOverride: integer('rate_limit_override'),
});

export const tasksTable = sqliteTable('tasks', {
  id:          text('id').primaryKey(),
  title:       text('title').notNull(),
  description: text('description'),
  status:      text('status').notNull().default('todo'),
  assignee:    text('assignee'),
  createdBy:   text('created_by').notNull(),
  ownerId:     text('owner_id').notNull(),
  updatedBy:   text('updated_by'),
  createdAt:   text('created_at').notNull(),
  updatedAt:   text('updated_at').notNull(),
});

export const refreshTokensTable = sqliteTable('refresh_tokens', {
  jti:          text('jti').primaryKey(),
  userId:       text('user_id').notNull(),
  expiresAt:    integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt:    integer('created_at', { mode: 'timestamp' }).notNull(),
  revokedAt:    integer('revoked_at', { mode: 'timestamp' }),
  replacedByJti: text('replaced_by_jti'),
});

export type DbUser  = typeof usersTable.$inferSelect;
export type DbAgent = typeof agentsTable.$inferSelect;
export type DbTask  = typeof tasksTable.$inferSelect;
export type DbRefreshToken = typeof refreshTokensTable.$inferSelect;

// ─── Singleton ────────────────────────────────────────────────────────────────

let _db: BetterSQLite3Database | null = null;
let _sqlite: ReturnType<typeof Database> | null = null;
const CURRENT_SCHEMA_VERSION = 2;
const DEFAULT_DATABASE_PATH = './data/platform.db';

interface DbMigration {
  version: number;
  description: string;
  up: (sqlite: ReturnType<typeof Database>) => void;
}

const migrations: DbMigration[] = [
  {
    version: 1,
    description: 'Initial schema (users, agents, tasks)',
    up: (sqlite) => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id            TEXT PRIMARY KEY,
          email         TEXT NOT NULL UNIQUE,
          name          TEXT NOT NULL,
          role          TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL,
          last_login_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS agents (
          id                  TEXT PRIMARY KEY,
          name                TEXT NOT NULL,
          api_key_hash        TEXT NOT NULL,
          active              INTEGER NOT NULL DEFAULT 1,
          created_at          INTEGER NOT NULL,
          last_used_at        INTEGER NOT NULL,
          request_count       INTEGER NOT NULL DEFAULT 0,
          rate_limit_override INTEGER
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id          TEXT PRIMARY KEY,
          title       TEXT NOT NULL,
          description TEXT,
          status      TEXT NOT NULL DEFAULT 'todo',
          assignee    TEXT,
          created_by  TEXT NOT NULL,
          owner_id    TEXT NOT NULL,
          updated_by  TEXT,
          created_at  TEXT NOT NULL,
          updated_at  TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 2,
    description: 'Refresh token sessions table',
    up: (sqlite) => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
          jti            TEXT PRIMARY KEY,
          user_id        TEXT NOT NULL,
          expires_at     INTEGER NOT NULL,
          created_at     INTEGER NOT NULL,
          revoked_at     INTEGER,
          replaced_by_jti TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
          ON refresh_tokens (user_id);

        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
          ON refresh_tokens (expires_at);
      `);
    },
  },
];

export function getDb(): BetterSQLite3Database {
  if (!_db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return _db;
}

/**
 * Checkpoint the WAL file so the .db file is complete on disk.
 * Call before process exit to ensure no data is lost.
 */
export async function checkpointDatabase(): Promise<void> {
  if (_sqlite) {
    _sqlite.pragma('wal_checkpoint(FULL)');
    console.log('✅ Database WAL checkpoint complete');
  }
}

export async function initializeDatabase(): Promise<void> {
  const env = process.env.NODE_ENV || 'development';
  const strictValidation =
    env === 'production' || process.env.STRICT_STARTUP_VALIDATION === 'true';
  const configuredDbPath = process.env.DATABASE_URL;
  const dbPath = configuredDbPath || DEFAULT_DATABASE_PATH;

  if (strictValidation && !configuredDbPath) {
    throw new Error(
      'DATABASE_URL must be explicitly set when strict startup validation is enabled.'
    );
  }

  if (dbPath === ':memory:') {
    throw new Error('In-memory SQLite (:memory:) is not allowed for this runtime.');
  }

  const allowDefaultSqlitePath =
    process.env.ALLOW_DEFAULT_SQLITE_IN_PRODUCTION === 'true';
  if (env === 'production' && !allowDefaultSqlitePath && dbPath === DEFAULT_DATABASE_PATH) {
    throw new Error(
      'Default SQLite path ./data/platform.db is blocked in production. Set DATABASE_URL to a managed path or set ALLOW_DEFAULT_SQLITE_IN_PRODUCTION=true.'
    );
  }

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  _sqlite = new Database(dbPath);
  const sqlite = _sqlite;

  // WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const row = sqlite
    .prepare('SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations')
    .get() as { version: number };
  const currentVersion = row?.version ?? 0;

  if (currentVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported ${CURRENT_SCHEMA_VERSION}.`
    );
  }

  const pending = migrations.filter((m) => m.version > currentVersion);
  for (const migration of pending) {
    const apply = sqlite.transaction(() => {
      migration.up(sqlite);
      sqlite
        .prepare(
          'INSERT INTO schema_migrations (version, description, applied_at) VALUES (?, ?, ?)'
        )
        .run(migration.version, migration.description, Date.now());
    });
    apply();
    console.log(`✅ Applied DB migration v${migration.version}: ${migration.description}`);
  }

  _db = drizzle(sqlite);

  const finalRow = sqlite
    .prepare('SELECT COALESCE(MAX(version), 0) as version FROM schema_migrations')
    .get() as { version: number };
  console.log(`✅ Database initialized: ${dbPath} (WAL mode, schema v${finalRow.version})`);
}
