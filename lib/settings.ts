import 'server-only'

import { eq, sql } from 'drizzle-orm'

import { db } from './db'
import { jqlPresets, prefixes, reportTemplates, settings } from './db/schema'

/**
 * SQLite is the source of truth for settings. .env.local only seeds the first
 * run, so credentials can be changed in the UI without editing files or
 * restarting. Once a key exists in the DB, the env var is ignored.
 */
export const SETTING_KEYS = {
  jiraBaseUrl: 'jira_base_url',
  jiraEmail: 'jira_email',
  jiraApiToken: 'jira_api_token',
  jiraProjectKey: 'jira_project_key',
  jiraBoardId: 'jira_board_id',
  googleApiKey: 'google_api_key',
  geminiModel: 'gemini_model',
  geminiFallbackModels: 'gemini_fallback_models',
  dailyQuotaHours: 'daily_quota_hours',
  logStepHours: 'log_step_hours',
  logPresets: 'log_presets',
  weekendCountsToQuota: 'weekend_counts_to_quota',
  sprintPrefixPattern: 'sprint_prefix_pattern',
  pointBudget1: 'point_budget_1',
  pointBudget2: 'point_budget_2',
  pointBudget3: 'point_budget_3',
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

const DEFAULTS: Record<string, string> = {
  // No project or board default: they are specific to whoever runs this, and a
  // wrong guess produces confusing empty screens rather than an obvious error.
  [SETTING_KEYS.jiraProjectKey]: '',
  [SETTING_KEYS.jiraBoardId]: '',
  [SETTING_KEYS.geminiModel]: 'gemini-3.1-flash-lite',
  // Tried in order when the primary is out of quota. Retrying the same model
  // cannot fix a spent quota — only a different one can.
  [SETTING_KEYS.geminiFallbackModels]: 'gemini-3-flash-preview,gemini-3.5-flash',
  [SETTING_KEYS.dailyQuotaHours]: '8',
  [SETTING_KEYS.logStepHours]: '0.5',
  [SETTING_KEYS.logPresets]: '0.5,1,2,4,8',
  [SETTING_KEYS.weekendCountsToQuota]: 'false',
  [SETTING_KEYS.sprintPrefixPattern]: '[spt {n}]',
  // Point budgets are advisory only — they drive a soft warning, never a block.
  [SETTING_KEYS.pointBudget1]: '1-2h',
  [SETTING_KEYS.pointBudget2]: '4h',
  [SETTING_KEYS.pointBudget3]: '1d-2d',
}

/** Env var consulted for each key on first run only. */
const ENV_SEED: Partial<Record<string, string>> = {
  [SETTING_KEYS.jiraBaseUrl]: 'JIRA_BASE_URL',
  [SETTING_KEYS.jiraEmail]: 'JIRA_EMAIL',
  [SETTING_KEYS.jiraApiToken]: 'JIRA_API_TOKEN',
  [SETTING_KEYS.jiraProjectKey]: 'JIRA_PROJECT_KEY',
  [SETTING_KEYS.jiraBoardId]: 'JIRA_BOARD_ID',
  [SETTING_KEYS.googleApiKey]: 'GOOGLE_API_KEY',
  [SETTING_KEYS.geminiModel]: 'GEMINI_MODEL',
}

const DEFAULT_PREFIXES = ['[Support]', '[Mobile]', '[BE]', '[Web]', '[Desktop]']

const DEFAULT_REPORT_TEMPLATE = `Daily Report {{next_date}}

Previous day:
{{#issues}}
- {{key}} | {{summary}}
{{/issues}}
Today:
- `

/**
 * Built-in JQL presets. {sp} is replaced at run time with the discovered story
 * point field id — hardcoding cf[10016] would break on any other project.
 */
const DEFAULT_JQL_PRESETS: Array<{ name: string; jql: string }> = [
  { name: 'của tôi, chưa Done', jql: 'project = {project} AND assignee = currentUser() AND statusCategory != Done ORDER BY created DESC' },
  { name: 'chưa ai nhận', jql: 'project = {project} AND assignee IS EMPTY AND statusCategory != Done ORDER BY created DESC' },
  { name: 'sprint đang mở', jql: 'project = {project} AND sprint IN openSprints() AND assignee = currentUser() ORDER BY created DESC' },
  { name: 'tôi tạo', jql: 'project = {project} AND reporter = currentUser() ORDER BY created DESC' },
  { name: 'subtask chưa có point', jql: 'project = {project} AND type = Subtask AND "cf[{sp}]" IS EMPTY ORDER BY created DESC' },
  { name: 'tôi log 7 ngày qua', jql: 'project = {project} AND worklogAuthor = currentUser() AND worklogDate >= -7d ORDER BY updated DESC' },
]

let seeded = false

/** Idempotent. Runs once per process, before any read. */
export function ensureSeeded() {
  if (seeded) return
  seeded = true

  const existing = new Set(db.select({ key: settings.key }).from(settings).all().map((r) => r.key))

  const rows: Array<{ key: string; value: string }> = []
  for (const key of Object.values(SETTING_KEYS)) {
    if (existing.has(key)) continue
    const envName = ENV_SEED[key]
    const value = (envName ? process.env[envName] : undefined) ?? DEFAULTS[key]
    if (value !== undefined && value !== '') rows.push({ key, value })
  }
  if (rows.length) db.insert(settings).values(rows).run()

  if (db.select({ n: sql<number>`count(*)` }).from(prefixes).get()?.n === 0) {
    db.insert(prefixes)
      .values(DEFAULT_PREFIXES.map((label, i) => ({ label, position: i })))
      .run()
  }

  if (db.select({ n: sql<number>`count(*)` }).from(reportTemplates).get()?.n === 0) {
    db.insert(reportTemplates)
      .values({ name: 'Mặc định', body: DEFAULT_REPORT_TEMPLATE, isDefault: true })
      .run()
  }

  if (db.select({ n: sql<number>`count(*)` }).from(jqlPresets).get()?.n === 0) {
    db.insert(jqlPresets)
      .values(DEFAULT_JQL_PRESETS.map((p, i) => ({ ...p, builtin: true, position: i })))
      .run()
  }
}

export function getSetting(key: SettingKey): string | undefined {
  ensureSeeded()
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value
}

export function getSettings(): Record<string, string> {
  ensureSeeded()
  const out: Record<string, string> = {}
  for (const row of db.select().from(settings).all()) out[row.key] = row.value
  return out
}

export function setSetting(key: SettingKey | string, value: string) {
  ensureSeeded()
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: sql`(strftime('%s','now'))` },
    })
    .run()
}

export function setSettings(entries: Record<string, string>) {
  for (const [key, value] of Object.entries(entries)) setSetting(key, value)
}

/** Redacts secrets so settings can be sent to a client component safely. */
export function getSettingsForClient() {
  const all = getSettings()
  const secretKeys: string[] = [SETTING_KEYS.jiraApiToken, SETTING_KEYS.googleApiKey]
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(all)) {
    out[k] = secretKeys.includes(k) ? (v ? '••••••••' + v.slice(-4) : '') : v
  }
  return out
}

/**
 * Project key, or a clear error.
 *
 * Previously each call site fell back to a hardcoded key. That produced empty
 * boards against a project the user does not own — which reads as "no work
 * today" rather than "not configured yet".
 */
export function requireProjectKey(): string {
  const key = getSetting(SETTING_KEYS.jiraProjectKey)?.trim()
  if (!key) throw new Error('Chưa chọn project — vào Settings điền Project key')
  return key
}

export function requireBoardId(): string {
  const id = getSetting(SETTING_KEYS.jiraBoardId)?.trim()
  if (!id) throw new Error('Chưa chọn board — vào Settings điền Board id')
  return id
}
