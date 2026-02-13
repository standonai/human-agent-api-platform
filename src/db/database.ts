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

export type DbUser  = typeof usersTable.$inferSelect;
export type DbAgent = typeof agentsTable.$inferSelect;
export type DbTask  = typeof tasksTable.$inferSelect;

// ─── Singleton ────────────────────────────────────────────────────────────────

let _db: BetterSQLite3Database | null = null;

export function getDb(): BetterSQLite3Database {
  if (!_db) throw new Error('Database not initialized. Call initializeDatabase() first.');
  return _db;
}

export async function initializeDatabase(): Promise<void> {
  const dbPath = process.env.DATABASE_URL || './data/platform.db';

  // Ensure parent directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);

  // WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');

  // Create tables (idempotent)
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

  _db = drizzle(sqlite);

  console.log(`✅ Database initialized: ${dbPath} (WAL mode)`);
}
