import 'server-only'

import { requireBoardId } from '../settings'
import { jiraFetch } from './client'

export interface Sprint {
  id: number
  name: string
  state: 'future' | 'active' | 'closed' | string
  startDate?: string
  endDate?: string
  completeDate?: string
  /** True for the one sprint the app treats as "now". */
  current?: boolean
}

/**
 * Lists every sprint on the board.
 *
 * This endpoint paginates with startAt/isLast (the search/jql nextPageToken
 * scheme does not apply here), and Jira orders results by state then backlog
 * position — never by date. So the caller must sort; do not trust the order.
 */
export async function listSprints(states = 'active,future'): Promise<Sprint[]> {
  const boardId = requireBoardId()
  const out: Sprint[] = []
  let startAt = 0

  for (let guard = 0; guard < 50; guard++) {
    const page = await jiraFetch<{ values?: Sprint[]; isLast?: boolean; maxResults?: number }>(
      `/rest/agile/1.0/board/${encodeURIComponent(boardId)}/sprint?state=${states}&startAt=${startAt}&maxResults=50`,
    )
    const values = page.values ?? []
    out.push(...values)
    if (page.isLast !== false || values.length === 0) break
    startAt += values.length
  }

  return out
}

function dayValue(iso?: string): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * Picks the sprint that is genuinely running.
 *
 * `state === 'active'` is useless on its own here: this board has nine sprints
 * simultaneously active because old ones are never completed. What separates the
 * real one is that its end date has not passed yet.
 *
 *   1. drop sprints that have not started
 *   2. keep those whose endDate is still in the future  ← does the real work
 *   3. if several remain, newest startDate wins, then highest id
 *   4. if none remain (everything overdue), fall back to the latest start
 */
export function pickCurrentSprint(sprints: Sprint[], now = Date.now()): Sprint | null {
  const active = sprints.filter((s) => s.state === 'active')
  const pool = active.length ? active : sprints

  const started = pool.filter((s) => {
    const start = dayValue(s.startDate)
    return start === null || start <= now
  })
  if (!started.length) return null

  const byRecency = (a: Sprint, b: Sprint) =>
    (dayValue(b.startDate) ?? 0) - (dayValue(a.startDate) ?? 0) || b.id - a.id

  const live = started.filter((s) => {
    const end = dayValue(s.endDate)
    return end !== null && end >= now
  })

  return (live.length ? live : started).sort(byRecency)[0] ?? null
}

/** Newest first. Sprints with no start date (future ones) sort to the top. */
export function sortSprints(sprints: Sprint[]): Sprint[] {
  return [...sprints].sort((a, b) => {
    const sa = dayValue(a.startDate)
    const sb = dayValue(b.startDate)
    if (sa === null && sb === null) return b.id - a.id
    if (sa === null) return -1
    if (sb === null) return 1
    return sb - sa || b.id - a.id
  })
}

export interface SprintList {
  sprints: Sprint[]
  current: Sprint | null
}

/**
 * Completed sprints are excluded: this board carries 66 of them and a picker
 * that long is unusable. Because the PM never completes sprints, everything
 * still relevant remains `active` anyway — so `active,future` is both shorter
 * and a better match for what people actually log against.
 */
export async function getSprints(): Promise<SprintList> {
  const all = await listSprints('active,future')
  const current = pickCurrentSprint(all)
  const sprints = sortSprints(all).map((s) => ({ ...s, current: s.id === current?.id }))
  return { sprints, current: current ? { ...current, current: true } : null }
}

/** `VT Sprint 66` → `66`, used to build the [spt 66] title prefix. */
export function sprintNumber(name: string): string | null {
  const m = name.match(/(\d+)\s*$/)
  return m ? m[1] : null
}

export function sprintPrefix(name: string, pattern: string): string | null {
  const n = sprintNumber(name)
  if (!n || !pattern.trim()) return null
  return pattern.replace('{n}', n)
}
