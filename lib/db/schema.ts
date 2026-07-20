import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const now = sql`(strftime('%s','now'))`

/**
 * Key/value settings. Jira and Gemini credentials live here, seeded once from
 * .env.local on first run so they can be changed in the UI without a restart.
 */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull().default(now),
})

/**
 * Title prefixes such as [Mobile] or [Support]. `position` drives the order the
 * chips render in; the order a user *clicks* them is what composes the title and
 * is not stored here.
 */
export const prefixes = sqliteTable(
  'prefixes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    label: text('label').notNull(),
    position: integer('position').notNull().default(0),
  },
  (t) => [uniqueIndex('prefixes_label_idx').on(t.label)],
)

/**
 * A task composed locally but not yet pushed to Jira. Once created it is deleted
 * — Jira is the source of truth from that point on, so nothing here mirrors it.
 */
export const drafts = sqliteTable('drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  idea: text('idea').notNull().default(''),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  dod: text('dod').notNull().default(''),
  /** JSON array of prefix labels, in composition order. */
  prefixes: text('prefixes').notNull().default('[]'),
  issueTypeId: text('issue_type_id'),
  parentKey: text('parent_key'),
  sprintId: integer('sprint_id'),
  storyPoints: integer('story_points'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
})

/**
 * Reusable task templates for work that repeats every sprint.
 *
 * Separate from `drafts` because the lifecycles differ: a draft is one specific
 * task-in-progress and is deleted the moment it becomes a Jira issue, while a
 * template is applied over and over and must survive.
 */
export const taskTemplates = sqliteTable('task_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  title: text('title').notNull().default(''),
  description: text('description').notNull().default(''),
  dod: text('dod').notNull().default(''),
  /** JSON array of prefix labels, in composition order. */
  prefixes: text('prefixes').notNull().default('[]'),
  issueTypeId: text('issue_type_id'),
  storyPoints: integer('story_points'),
  useCount: integer('use_count').notNull().default(0),
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull().default(now),
})

/**
 * Days the user was away, so the "short hours" figure reflects reality.
 *
 * Local only — Jira has no concept of the user's leave, and the team tracks it
 * elsewhere. This exists purely so the board stops reporting a day as short when
 * there was never eight hours to log.
 */
export const daysOff = sqliteTable('days_off', {
  /** Local date, YYYY-MM-DD. */
  date: text('date').primaryKey(),
  /** 'full' | 'morning' | 'afternoon' */
  kind: text('kind').notNull(),
  createdAt: integer('created_at').notNull().default(now),
})

/** Saved JQL, including the built-in presets shown on the search screen. */
export const jqlPresets = sqliteTable('jql_presets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  jql: text('jql').notNull(),
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull().default(0),
})

/** Daily-report templates. Exactly one row has `isDefault` set. */
export const reportTemplates = sqliteTable('report_templates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  body: text('body').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
})

/**
 * Field ids and issue types discovered from Jira's createmeta. Cached because
 * they change rarely, but never hardcoded — ids differ per instance and per
 * project style. `scope` is the project key so a second project cannot collide.
 */
export const jiraMetaCache = sqliteTable(
  'jira_meta_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    fetchedAt: integer('fetched_at').notNull().default(now),
  },
  (t) => [uniqueIndex('jira_meta_scope_key_idx').on(t.scope, t.key)],
)

/**
 * Reports already generated, kept so a past day can be reopened without
 * re-deriving it. The worklogs themselves are never copied — they stay in Jira.
 */
export const reportHistory = sqliteTable(
  'report_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Local date the report covers, as YYYY-MM-DD. */
    reportDate: text('report_date').notNull(),
    body: text('body').notNull(),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [index('report_history_date_idx').on(t.reportDate)],
)

export type Setting = typeof settings.$inferSelect
export type Prefix = typeof prefixes.$inferSelect
export type Draft = typeof drafts.$inferSelect
export type TaskTemplate = typeof taskTemplates.$inferSelect
export type DayOff = typeof daysOff.$inferSelect
export type JqlPreset = typeof jqlPresets.$inferSelect
export type ReportTemplate = typeof reportTemplates.$inferSelect
