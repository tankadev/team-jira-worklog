/**
 * Day boundaries and Jira timestamps, computed in the user's own timezone.
 *
 * Getting this wrong shifts worklogs onto the wrong day, which quietly corrupts
 * the daily report — so every conversion here is explicit rather than relying on
 * the server's local zone.
 */

export const DEFAULT_TZ = 'Asia/Saigon'

/** Offset of `tz` at instant `at`, in minutes east of UTC. */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(at).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  return Math.round((asUtc - at.getTime()) / 60000)
}

/** `+0700` — colon-less, which is the form Jira's worklog API accepts. */
export function offsetString(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}${String(abs % 60).padStart(2, '0')}`
}

/** Today in `tz`, as YYYY-MM-DD. */
export function todayIn(tz = DEFAULT_TZ, at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}

/** Epoch ms for local midnight starting `date` (YYYY-MM-DD) in `tz`. */
export function startOfDay(date: string, tz = DEFAULT_TZ): number {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0)
  // Two passes: the first offset may be wrong across a DST edge.
  let offset = tzOffsetMinutes(tz, new Date(guess))
  offset = tzOffsetMinutes(tz, new Date(guess - offset * 60000))
  return guess - offset * 60000
}

export function endOfDay(date: string, tz = DEFAULT_TZ): number {
  return startOfDay(date, tz) + 24 * 60 * 60 * 1000 - 1
}

/**
 * Builds the `started` value for a worklog.
 *
 * Format is `2026-06-17T14:40:00.000+0700`: milliseconds required, offset
 * without a colon. `Date.prototype.toISOString()` emits `…Z` and is rejected —
 * this is the single most common way worklog POSTs fail.
 *
 * The clock time carries no meaning for this team (only the daily total is
 * checked), so worklogs start at 09:00 and step forward to keep them distinct.
 */
export function jiraStarted(date: string, tz = DEFAULT_TZ, sequence = 0): string {
  const base = startOfDay(date, tz)
  const offset = tzOffsetMinutes(tz, new Date(base))
  const at = base + (9 * 60 + sequence) * 60000

  const local = new Date(at + offset * 60000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')

  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `.${pad(local.getUTCMilliseconds(), 3)}${offsetString(offset)}`
  )
}

export function hoursToSeconds(hours: number): number {
  return Math.round(hours * 3600)
}

export function secondsToHours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100
}

/** `6.5` → `6h 30m`, the shape Jira shows in its own UI. */
export function formatDuration(seconds: number): string {
  if (!seconds) return '0h'
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

export function isWeekend(date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return day === 0 || day === 6
}

const VI_DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

export function formatDateVi(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${VI_DAYS[day]} · ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d + delta))
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}-${String(at.getUTCDate()).padStart(2, '0')}`
}

/** Monday-first week containing `date`. */
export function weekOf(date: string): string[] {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const monday = addDays(date, dow === 0 ? -6 : 1 - dow)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}
