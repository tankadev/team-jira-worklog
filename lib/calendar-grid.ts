/**
 * Month grids and day status for the worklog calendar. Pure — used on both
 * sides: the server decides which days to fetch, the client lays them out.
 */
import { addDays } from './time'

/** The six Monday-first weeks that show `month` (YYYY-MM) whole: 42 dates. */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`
  // getUTCDay on a date-only string is the weekday without timezone drift.
  const weekday = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 // Mon = 0
  const start = addDays(first, -weekday)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export type DayStatus = 'off' | 'empty' | 'short' | 'full' | 'over'

/**
 * How a day stands against its quota.
 *
 * `off` is a day with no quota (weekend, leave) and nothing logged; time logged
 * on such a day is overtime. A minute either way of the quota still counts as
 * full — worklogs are stored in seconds and rounding must not flag 8h as short.
 */
export function dayStatus(seconds: number, quotaHours: number): DayStatus {
  const quota = quotaHours * 3600
  if (quota <= 0) return seconds > 0 ? 'over' : 'off'
  if (seconds <= 0) return 'empty'
  if (seconds < quota - 60) return 'short'
  if (seconds > quota + 60) return 'over'
  return 'full'
}

/** The message after a day changes: "đủ 8h", "còn thiếu 2h", "vượt 1h". */
export function dayStatusText(seconds: number, quotaHours: number): string {
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`
  }
  const status = dayStatus(seconds, quotaHours)
  if (status === 'full') return `đủ ${fmt(quotaHours * 3600)} ✓`
  if (status === 'short') return `còn thiếu ${fmt(quotaHours * 3600 - seconds)}`
  if (status === 'over')
    return quotaHours > 0 ? `vượt ${fmt(seconds - quotaHours * 3600)} (OT)` : `ngày nghỉ — ${fmt(seconds)} OT`
  if (status === 'empty') return `chưa log, cần ${fmt(quotaHours * 3600)}`
  return 'ngày nghỉ'
}
