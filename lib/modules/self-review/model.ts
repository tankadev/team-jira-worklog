/**
 * Personal sprint review: what one person's subtasks in a sprint add up to.
 *
 * Pure — rows come from `getSprintPoints`, which is already scoped to the
 * current user, so every number here is "mine". Kept free of server imports so
 * the figures can be checked without Jira and so the page can hand the same
 * rows to the charts and the table.
 */
import { type PointRow, statusTone } from '@/lib/jira/types'
import { sprintNumber } from '@/lib/sprint-name'

/**
 * Task size buckets. The team estimates in 1 / 2 / 3 only (bigger work is
 * split), so anything else — a 5, a 0.5 — is "other" rather than a bucket of
 * its own, and a subtask with no estimate is counted separately: it still took
 * hours, and "how many tasks went unpointed" is itself worth seeing.
 */
export type SizeKey = '1' | '2' | '3' | 'other' | 'none'
export const SIZE_ORDER: SizeKey[] = ['1', '2', '3', 'other', 'none']
export const SIZE_LABEL: Record<SizeKey, string> = {
  '1': '1 point',
  '2': '2 point',
  '3': '3 point',
  other: 'Point khác',
  none: 'Chưa có point',
}

export function sizeOf(points: number | null): SizeKey {
  if (points === null) return 'none'
  if (points === 1 || points === 2 || points === 3) return String(points) as SizeKey
  return 'other'
}

export interface SizeCount {
  tasks: number
  /** Of those, how many are Done. */
  done: number
  points: number
}

export interface SprintInput {
  id: number
  name: string
  startDate?: string
  endDate?: string
  current?: boolean
}

export interface SprintReview {
  id: number
  name: string
  /** `S72` — short enough for a chart axis. Falls back to the full name. */
  label: string
  start: string | null
  end: string | null
  current: boolean
  tasks: number
  doneTasks: number
  points: number
  /** Jira's own closed state, nothing else — see `summarisePoints`. */
  donePoints: number
  /** Verified but not yet closed: can still come back, so shown on its own. */
  verifiedPoints: number
  /** In progress or waiting for test. */
  activePoints: number
  todoPoints: number
  /** Hours logged across every subtask, Done or not. */
  seconds: number
  /** Hours logged on subtasks that carry an estimate — the base for hours/point. */
  pointedSeconds: number
  sizes: Record<SizeKey, SizeCount>
}

function emptySizes(): Record<SizeKey, SizeCount> {
  return {
    '1': { tasks: 0, done: 0, points: 0 },
    '2': { tasks: 0, done: 0, points: 0 },
    '3': { tasks: 0, done: 0, points: 0 },
    other: { tasks: 0, done: 0, points: 0 },
    none: { tasks: 0, done: 0, points: 0 },
  }
}

export function reviewSprint(sprint: SprintInput, rows: PointRow[]): SprintReview {
  const r: SprintReview = {
    id: sprint.id,
    name: sprint.name,
    label: sprintNumber(sprint.name) ? `S${sprintNumber(sprint.name)}` : sprint.name,
    start: sprint.startDate?.slice(0, 10) ?? null,
    end: sprint.endDate?.slice(0, 10) ?? null,
    current: Boolean(sprint.current),
    tasks: 0,
    doneTasks: 0,
    points: 0,
    donePoints: 0,
    verifiedPoints: 0,
    activePoints: 0,
    todoPoints: 0,
    seconds: 0,
    pointedSeconds: 0,
    sizes: emptySizes(),
  }

  for (const row of rows) {
    const tone = statusTone(row.statusName)
    const p = row.storyPoints ?? 0
    const done = tone === 'done'

    r.tasks++
    if (done) r.doneTasks++
    r.points += p
    r.seconds += row.timeSpentSeconds
    if (row.storyPoints !== null) r.pointedSeconds += row.timeSpentSeconds

    if (done) r.donePoints += p
    else if (tone === 'ver') r.verifiedPoints += p
    else if (tone === 'todo') r.todoPoints += p
    else r.activePoints += p

    const size = r.sizes[sizeOf(row.storyPoints)]
    size.tasks++
    size.points += p
    if (done) size.done++
  }

  return r
}

/** Hours of estimated work per point; null when nothing is estimated yet. */
export function hoursPerPoint(r: { points: number; pointedSeconds: number }): number | null {
  return r.points > 0 ? r.pointedSeconds / 3600 / r.points : null
}

export interface ReviewTotals {
  sprints: number
  tasks: number
  doneTasks: number
  points: number
  donePoints: number
  seconds: number
  pointedSeconds: number
  sizes: Record<SizeKey, SizeCount>
  /** Done points per sprint, over the sprints given. */
  avgDonePoints: number
}

export function totalReviews(reviews: SprintReview[]): ReviewTotals {
  const t: ReviewTotals = {
    sprints: reviews.length,
    tasks: 0,
    doneTasks: 0,
    points: 0,
    donePoints: 0,
    seconds: 0,
    pointedSeconds: 0,
    sizes: emptySizes(),
    avgDonePoints: 0,
  }
  for (const r of reviews) {
    t.tasks += r.tasks
    t.doneTasks += r.doneTasks
    t.points += r.points
    t.donePoints += r.donePoints
    t.seconds += r.seconds
    t.pointedSeconds += r.pointedSeconds
    for (const k of SIZE_ORDER) {
      t.sizes[k].tasks += r.sizes[k].tasks
      t.sizes[k].done += r.sizes[k].done
      t.sizes[k].points += r.sizes[k].points
    }
  }
  t.avgDonePoints = reviews.length ? t.donePoints / reviews.length : 0
  return t
}

/** `12` → "12", `12.5` → "12.5", `1.333` → "1.3". */
export function fmtNum(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.0$/, '')
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

/** How many sprints back the page can look. */
export const COUNT_OPTIONS = [4, 6, 8, 12] as const
export const DEFAULT_COUNT = 6
