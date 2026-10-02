import 'server-only'

import { monthGrid } from './calendar-grid'
import { listDaysOff } from './days-off'
import { getMyself } from './jira/client'
import { getWorklogs } from './jira/worklog'
import { type DayOffKind, type QuotaRules, quotaForDate } from './quota'
import { SETTING_KEYS, getSetting, getWorkSchedule } from './settings'
import { DEFAULT_TZ, isWeekend, todayIn, tzOffsetMinutes } from './time'

export interface CalendarDay {
  date: string
  /** Everything this user logged that day, across every issue. */
  seconds: number
  quotaHours: number
  dayOff: DayOffKind | null
  weekend: boolean
}

export interface CalendarEntry {
  id: string
  issueKey: string
  date: string
  /** Local start, minutes from midnight. */
  start: number
  seconds: number
}

export interface CalendarMonth {
  month: string
  today: string
  days: CalendarDay[]
  /** Worklogs of the issue asked about (empty without one). */
  entries: CalendarEntry[]
}

/** The same quota rules the board uses, for an arbitrary window. */
export function quotaRules(from: string, to: string): QuotaRules {
  return {
    dailyHours: Number(getSetting(SETTING_KEYS.dailyQuotaHours) ?? '8') || 8,
    schedule: getWorkSchedule(),
    weekendCounts: getSetting(SETTING_KEYS.weekendCountsToQuota) === 'true',
    daysOff: listDaysOff(from, to),
  }
}

/** Minutes from local midnight of a Jira `started` timestamp. */
function localMinute(started: string, tz: string): number {
  const at = new Date(started.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  const offset = tzOffsetMinutes(tz, at)
  const local = new Date(at.getTime() + offset * 60000)
  return local.getUTCHours() * 60 + local.getUTCMinutes()
}

/**
 * One month of the user's time, laid out for the calendar: every day of the
 * six-week grid with its total and quota, plus the worklogs of one issue.
 *
 * One `getWorklogs` over the grid — the same reads the board makes, so they
 * come out of the same read cache.
 */
export async function calendarMonth(month: string, issueKey?: string | null): Promise<CalendarMonth> {
  const grid = monthGrid(month)
  const from = grid[0]
  const to = grid[grid.length - 1]

  const me = await getMyself()
  const tz = me.timeZone ?? DEFAULT_TZ
  const entries = await getWorklogs(from, to, me.accountId, tz, [], issueKey ? [issueKey] : [])
  const rules = quotaRules(from, to)

  const byDate = new Map<string, number>()
  for (const e of entries) byDate.set(e.date, (byDate.get(e.date) ?? 0) + e.timeSpentSeconds)

  return {
    month,
    today: todayIn(tz),
    days: grid.map((date) => ({
      date,
      seconds: byDate.get(date) ?? 0,
      quotaHours: quotaForDate(date, rules),
      dayOff: rules.daysOff[date] ?? null,
      weekend: isWeekend(date),
    })),
    entries: issueKey
      ? entries
          .filter((e) => e.issueKey === issueKey)
          .map((e) => ({
            id: e.id,
            issueKey: e.issueKey,
            date: e.date,
            start: localMinute(e.started, tz),
            seconds: e.timeSpentSeconds,
          }))
          .sort((a, b) => (a.date === b.date ? a.start - b.start : a.date < b.date ? -1 : 1))
      : [],
  }
}
