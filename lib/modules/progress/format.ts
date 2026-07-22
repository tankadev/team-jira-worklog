/**
 * Pure rendering for the member report — no database, no `server-only`, so both
 * the server action and the client editor's live preview share one source of
 * truth for the output shape.
 */

export interface ProgressItem {
  prefix: string
  feature: string
  document: string
  implement: string
  fix: string
}

export interface ProgressReportShape {
  member: string
  /** YYYY-MM-DD. */
  reportDate: string
  items: ProgressItem[]
}

/** `2026-07-22` → `22/07/2026`, the form the report is written in. */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** A value the user did not fill reads as `Todo`, matching the sample report. */
function value(v: string): string {
  return v.trim() || 'Todo'
}

/**
 * Document/Implement are percentages: a bare number gets a `%` suffix so the
 * user can just type `100`. Anything already carrying a unit or word — `100%`,
 * `Todo`, `8/11` — is left untouched.
 */
function percentValue(v: string): string {
  const s = v.trim()
  if (!s) return 'Todo'
  return /^\d+(?:\.\d+)?$/.test(s) ? `${s}%` : s
}

/**
 * Renders the copy-ready report:
 *
 *   [Member Report] Wind - 22/07/2026
 *
 *   FR [Mobile Lite] Invite Link & Approval to Join Room
 *   + Document: 100%
 *   + Implement: 100%
 *   + Fix: 8/11
 *
 * Feature lines with no title are skipped, so a half-typed row never leaks in.
 */
export function renderMemberReport(
  report: ProgressReportShape,
  opts: { markdown?: boolean } = {},
): string {
  const header = `[Member Report] ${report.member.trim() || '—'} - ${displayDate(report.reportDate)}`

  const blocks = report.items
    .filter((it) => it.feature.trim())
    .map((it) => {
      const title = [it.prefix.trim(), it.feature.trim()].filter(Boolean).join(' ')
      // Feature titles are bolded in markdown so the pasted report reads with a
      // clear heading per feature in group chats that render it.
      const heading = opts.markdown ? `**${title}**` : title
      return (
        `${heading}\n` +
        `+ Document: ${percentValue(it.document)}\n` +
        `+ Implement: ${percentValue(it.implement)}\n` +
        `+ Fix: ${value(it.fix)}`
      )
    })

  return blocks.length ? `${header}\n\n${blocks.join('\n\n')}` : header
}

/**
 * Reads a progress value as a 0–100 percent for the little bar in the editor.
 * Understands `100%`, `8/11` and plain numbers; anything else (e.g. `Todo`) is 0.
 */
export function progressPercent(v: string): number {
  const s = v.trim()
  const frac = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
  if (frac) {
    const den = Number(frac[2])
    return den ? clamp((Number(frac[1]) / den) * 100) : 0
  }
  const num = s.match(/^(\d+(?:\.\d+)?)\s*%?$/)
  if (num) return clamp(Number(num[1]))
  return 0
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n))
}
