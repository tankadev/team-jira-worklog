import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'app.db')

/**
 * Tables are created here rather than through drizzle-kit migrations: this is a
 * single-user local app, and a migration folder would be ceremony without
 * payoff. Every statement is IF NOT EXISTS so this is safe to run on every boot.
 */
const CREATE_TABLES = `
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS prefixes (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  label    TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS prefixes_label_idx ON prefixes (label);

CREATE TABLE IF NOT EXISTS drafts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  idea          TEXT NOT NULL DEFAULT '',
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  dod           TEXT NOT NULL DEFAULT '',
  prefixes      TEXT NOT NULL DEFAULT '[]',
  issue_type_id TEXT,
  parent_key    TEXT,
  sprint_id     INTEGER,
  story_points  INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS task_templates (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  dod           TEXT NOT NULL DEFAULT '',
  prefixes      TEXT NOT NULL DEFAULT '[]',
  issue_type_id TEXT,
  story_points  INTEGER,
  use_count     INTEGER NOT NULL DEFAULT 0,
  last_used_at  INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS jql_presets (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  jql      TEXT NOT NULL,
  builtin  INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS report_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  body       TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS jira_meta_cache (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  scope      TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  fetched_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS jira_meta_scope_key_idx ON jira_meta_cache (scope, key);

CREATE TABLE IF NOT EXISTS report_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS report_history_date_idx ON report_history (report_date);
`

function open() {
  fs.mkdirSync(DB_DIR, { recursive: true })
  const sqlite = new Database(DB_PATH)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(CREATE_TABLES)
  return drizzle(sqlite, { schema })
}

/**
 * Next's dev server re-evaluates modules on every hot reload, which would leak a
 * new SQLite handle each time. Stash the instance on globalThis so reloads reuse
 * one connection.
 */
const globalForDb = globalThis as unknown as { __jiraLogworkDb?: ReturnType<typeof open> }

export const db = globalForDb.__jiraLogworkDb ?? open()

if (process.env.NODE_ENV !== 'production') globalForDb.__jiraLogworkDb = db

export { schema }
