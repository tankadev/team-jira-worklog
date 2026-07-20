import { isWeekend } from './time'

/**
 * How many hours a given day is expected to hold.
 *
 * Previously this line was copied into four components, so a change to the rule
 * meant finding all four — and any one that was missed would quietly disagree
 * with the others about whether a day was short.
 *
 * Pure and free of server imports so both the board and its panels can use it.
 */

export type DayOffKind = 'full' | 'morning' | 'afternoon'

export interface QuotaRules {
  /** Hours expected on a normal working day. */
  dailyHours: number
  /** Whether Saturday and Sunday carry the same expectation. */
  weekendCounts: boolean
  /** date (YYYY-MM-DD) → kind of leave taken. */
  daysOff: Record<string, DayOffKind>
}

export function quotaForDate(date: string, rules: QuotaRules): number {
  if (isWeekend(date) && !rules.weekendCounts) return 0

  const off = rules.daysOff[date]
  if (off === 'full') return 0
  // Half a day off leaves half the quota. Derived rather than configured so it
  // follows whatever the daily figure is set to.
  if (off === 'morning' || off === 'afternoon') return rules.dailyHours / 2

  return rules.dailyHours
}

export function isDayOff(date: string, rules: QuotaRules): boolean {
  return Boolean(rules.daysOff[date]) || (isWeekend(date) && !rules.weekendCounts)
}

export const DAY_OFF_LABEL: Record<DayOffKind, string> = {
  full: 'Nghỉ cả ngày',
  morning: 'Nghỉ sáng',
  afternoon: 'Nghỉ chiều',
}

export const DAY_OFF_SHORT: Record<DayOffKind, string> = {
  full: 'nghỉ',
  morning: 'nghỉ sáng',
  afternoon: 'nghỉ chiều',
}
