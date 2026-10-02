/**
 * One colour per workflow status.
 *
 * `statusTone` sorts statuses into five buckets for the app's own rules (what
 * counts as done, what is still to do). That is too coarse to read a board by:
 * "In Progress" and "COMMITED CODE FEATURE BRANCH" shared one teal, and the
 * three "READY TO TEST ON …" were indistinguishable. Here every status in the
 * workflow gets its own colour, ordered so the eye can follow a ticket along:
 *
 *   To Do · In Progress · Committed · Ready to test (dev → integration →
 *   staging) · Verified (dev → integration → staging) · Done · Blocked
 *
 * Within each family the environment steps from light to deep. A status this
 * table does not know still gets a stable colour, picked from its name.
 *
 * Returns a class name; the colours themselves live in globals.css so both
 * themes are defined in one place.
 */
export type StatusStyle =
  | 'st-todo'
  | 'st-prog'
  | 'st-commit'
  | 'st-rt-dev'
  | 'st-rt-int'
  | 'st-rt-stg'
  | 'st-v-dev'
  | 'st-v-int'
  | 'st-v-stg'
  | 'st-done'
  | 'st-blocked'
  | 'st-x1'
  | 'st-x2'
  | 'st-x3'

const ENV = (s: string, dev: StatusStyle, int: StatusStyle, stg: StatusStyle) =>
  /STAG/.test(s) ? stg : /INTEGRAT/.test(s) ? int : dev

export function statusStyle(name: string): StatusStyle {
  const s = name.trim().toUpperCase()
  if (s === 'TO DO' || s === 'TODO' || s === 'OPEN' || s === 'BACKLOG') return 'st-todo'
  if (s === 'DONE' || s === 'CLOSED' || s === 'RESOLVED') return 'st-done'
  if (s.startsWith('BLOCK')) return 'st-blocked'
  if (s.includes('COMMIT')) return 'st-commit'
  if (/^READY\b.*\bTEST\b/.test(s)) return ENV(s, 'st-rt-dev', 'st-rt-int', 'st-rt-stg')
  if (s.startsWith('VERIFIED')) return ENV(s, 'st-v-dev', 'st-v-int', 'st-v-stg')
  if (s === 'IN PROGRESS' || s === 'IN DEVELOPMENT') return 'st-prog'

  // Unknown: stable per name, so the same status is always the same colour.
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return (['st-x1', 'st-x2', 'st-x3'] as const)[Math.abs(h) % 3]
}
