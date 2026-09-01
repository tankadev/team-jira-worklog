import 'server-only'

import { and, eq } from 'drizzle-orm'

import { db } from '../db'
import { jiraMetaCache } from '../db/schema'
import { SETTING_KEYS, getSetting } from '../settings'
import { jiraFetch } from './client'

/**
 * What the Jira board itself says about the team using it.
 *
 * Two things here cannot be learned from the project alone:
 *
 *   - Which issues belong to this team. One project can carry several boards,
 *     each a saved filter over the same issues — VipTalk splits CTALK-TEAM from
 *     HIR-TEAM with nothing but `labels in (ctalk)`. The filter JQL is the only
 *     authoritative statement of that split.
 *   - Which field holds the estimate. A company-managed project can keep Story
 *     Points off every screen and still estimate through the backlog, so
 *     createmeta reports no story-point field at all while the board knows
 *     exactly which one it is.
 */
export interface BoardConfig {
  id: string
  name: string
  /** 'scrum' | 'kanban'. */
  type: string
  projectKey: string | null
  /** Raw JQL of the board's saved filter, ORDER BY included. */
  filterJql: string | null
  /** Labels named by that filter — the team split, when there is one. */
  filterLabels: string[]
  /** The board's estimation field, e.g. customfield_10033. */
  estimationFieldId: string | null
  estimationFieldName: string | null
}

const CACHE_VERSION = 1
const CACHE_KEY = `board_config_v${CACHE_VERSION}`
const CACHE_TTL_SECONDS = 60 * 60 * 24

function scopeOf(boardId: string) {
  return `board:${boardId}`
}

function readCache(boardId: string): BoardConfig | null {
  const row = db
    .select()
    .from(jiraMetaCache)
    .where(and(eq(jiraMetaCache.scope, scopeOf(boardId)), eq(jiraMetaCache.key, CACHE_KEY)))
    .get()
  if (!row) return null
  if (Date.now() / 1000 - row.fetchedAt > CACHE_TTL_SECONDS) return null
  try {
    return JSON.parse(row.value) as BoardConfig
  } catch {
    return null
  }
}

function writeCache(boardId: string, config: BoardConfig) {
  db.insert(jiraMetaCache)
    .values({ scope: scopeOf(boardId), key: CACHE_KEY, value: JSON.stringify(config) })
    .onConflictDoUpdate({
      target: [jiraMetaCache.scope, jiraMetaCache.key],
      set: { value: JSON.stringify(config), fetchedAt: Math.floor(Date.now() / 1000) },
    })
    .run()
}

/**
 * Pulls the labels out of a filter's JQL.
 *
 * Deliberately a regex over the text rather than a JQL parser: the one clause
 * that matters has a fixed shape in every board filter Jira generates —
 * `labels in (a, b)` or `labels = a` — and a parser for the rest of the grammar
 * would be a large amount of code serving no other caller.
 */
export function labelsFromJql(jql: string): string[] {
  const out: string[] = []

  for (const m of jql.matchAll(/\blabels\s+in\s*\(([^)]*)\)/gi)) {
    for (const raw of m[1].split(',')) {
      const value = raw.trim().replace(/^["']|["']$/g, '')
      if (value) out.push(value)
    }
  }
  for (const m of jql.matchAll(/\blabels\s*=\s*("[^"]*"|'[^']*'|[^\s()]+)/gi)) {
    const value = m[1].trim().replace(/^["']|["']$/g, '')
    if (value) out.push(value)
  }

  return [...new Set(out)]
}

async function fetchBoardConfig(boardId: string): Promise<BoardConfig> {
  const config = await jiraFetch<{
    id: number
    name?: string
    type?: string
    location?: { key?: string }
    filter?: { id?: string }
    estimation?: { field?: { fieldId?: string; displayName?: string } }
  }>(`/rest/agile/1.0/board/${encodeURIComponent(boardId)}/configuration`)

  let filterJql: string | null = null
  if (config.filter?.id) {
    // A filter the user can see the board for is not always a filter they can
    // read directly — a missing JQL only costs auto-detection, never a screen.
    const filter = await jiraFetch<{ jql?: string }>(
      `/rest/api/3/filter/${encodeURIComponent(config.filter.id)}`,
    ).catch(() => null)
    filterJql = filter?.jql ?? null
  }

  return {
    id: String(config.id),
    name: config.name ?? '',
    type: config.type ?? '',
    projectKey: config.location?.key ?? null,
    filterJql,
    filterLabels: filterJql ? labelsFromJql(filterJql) : [],
    estimationFieldId: config.estimation?.field?.fieldId ?? null,
    estimationFieldName: config.estimation?.field?.displayName ?? null,
  }
}

/** Null when no board is configured — callers must degrade, not fail. */
export async function getBoardConfig(opts: { refresh?: boolean } = {}): Promise<BoardConfig | null> {
  const boardId = getSetting(SETTING_KEYS.jiraBoardId)?.trim()
  if (!boardId) return null

  if (!opts.refresh) {
    const cached = readCache(boardId)
    if (cached) return cached
  }

  try {
    const config = await fetchBoardConfig(boardId)
    writeCache(boardId, config)
    return config
  } catch {
    // Board config is an enhancement on every path that reads it: without it the
    // app falls back to createmeta and to the unfiltered sprint list.
    return null
  }
}

export interface DetectedTeamScope {
  boardName: string
  label: string | null
  prefix: string | null
  sprintFilter: string | null
  estimationFieldId: string | null
  filterJql: string | null
}

/**
 * Reads the team split off the board so the settings screen can offer it.
 *
 * The three values come from two places, both of the team's own making:
 * the label from the board filter, and the prefix + sprint token from the board
 * name — `CTALK-TEAM` yields `[CTALK]` and `CTALK`, which is exactly how that
 * team names its sprints ("CTALK-TEAM Sprint 69") and its summaries.
 */
export async function detectTeamScope(): Promise<DetectedTeamScope | null> {
  const config = await getBoardConfig({ refresh: true })
  if (!config) return null

  const label = config.filterLabels[0] ?? null
  // `CTALK-TEAM` → `CTALK`; a name with no -TEAM suffix is used whole.
  const token = config.name.replace(/[-\s]*team\s*$/i, '').trim()

  return {
    boardName: config.name,
    label,
    prefix: token ? `[${token.toUpperCase()}]` : null,
    sprintFilter: token || null,
    estimationFieldId: config.estimationFieldId,
    filterJql: config.filterJql,
  }
}
