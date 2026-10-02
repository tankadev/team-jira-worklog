import { addDays, formatDuration } from './time'

export interface ReportIssue {
  key: string
  summary: string
  seconds: number
}

export interface ReportContext {
  /** Date the report covers — the "previous day" — YYYY-MM-DD. */
  date: string
  /**
   * The day the report is written for, behind {{next_date}}. Defaults to the
   * day after `date`, which is wrong across a weekend: Monday's report covers
   * Friday, and "Friday + 1" would head it with Saturday.
   */
  reportDate?: string
  /**
   * Nothing was logged on `date` and the user marked it as off: the issues
   * block renders a single "Off" line in place of the (empty) list.
   */
  previousOff?: boolean
  issues: ReportIssue[]
  totalSeconds: number
  displayName?: string
  sprintName?: string
  /** Show the Jira issue key on each line. Off by default. */
  showKey?: boolean
  /**
   * In-progress tasks to list under "Today". When present they are appended to
   * the report as bullet lines, replacing any trailing empty bullet the template
   * leaves under its "Today:" heading. Off by default.
   */
  todayIssues?: ReportIssue[]
}

// {{key}} plus the separator that usually follows it (`ABC-1 | summary`), so
// hiding the key doesn't leave a dangling `| ` behind.
const KEY_WITH_SEP = /\{\{key\}\}[ \t]*[|\-–—:·]?[ \t]*/g

function ddmmyyyy(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}-${m}-${y}`
}

/**
 * Renders a report template.
 *
 * Deliberately a tiny subset of mustache rather than a real template engine:
 * the only structure a report needs is one repeated block of issues, and a
 * dependency that can evaluate arbitrary expressions would be a liability in a
 * field the user edits by hand.
 *
 * Supported:
 *   {{date}} {{next_date}} {{total}} {{count}} {{name}} {{sprint}}
 *   {{#issues}} … {{key}} {{summary}} {{time}} … {{/issues}}
 */
export function renderReport(template: string, ctx: ReportContext): string {
  const scalars: Record<string, string> = {
    date: ddmmyyyy(ctx.date),
    next_date: ddmmyyyy(ctx.reportDate ?? addDays(ctx.date, 1)),
    date_iso: ctx.date,
    total: formatDuration(ctx.totalSeconds),
    total_hours: (ctx.totalSeconds / 3600).toFixed(ctx.totalSeconds % 3600 === 0 ? 0 : 2),
    count: String(ctx.issues.length),
    name: ctx.displayName ?? '',
    sprint: ctx.sprintName ?? '',
  }

  // One row per issue, with the per-row fields substituted. Shared by the
  // {{#issues}} and {{#today}} blocks so they format identically. A row with no
  // key is not an issue at all (the "Off" line): it drops the key and the time
  // whatever the settings, rather than printing ` | Off (0h)`.
  const renderRows = (body: string, list: ReportIssue[]) =>
    list
      .map((issue) =>
        (ctx.showKey && issue.key
          ? body.replace(/\{\{key\}\}/g, issue.key)
          : body.replace(KEY_WITH_SEP, ''))
          .replace(/\{\{summary\}\}/g, issue.summary)
          .replace(/[ \t]*\(?\{\{time\}\}\)?/g, (m) =>
            issue.key ? m.replace('{{time}}', formatDuration(issue.seconds)) : '',
          )
          .replace(/[ \t]*\(?\{\{hours\}\}h?\)?/g, (m) =>
            issue.key
              ? m.replace('{{hours}}', (issue.seconds / 3600).toFixed(2).replace(/\.?0+$/, ''))
              : '',
          ),
      )
      .join('')

  const previous: ReportIssue[] =
    ctx.previousOff && !ctx.issues.length ? [{ key: '', summary: 'Off', seconds: 0 }] : ctx.issues

  const hasTodayBlock = /\{\{#today\}\}/.test(template)

  // Repeated blocks first, so scalars inside them resolve per row.
  let out = template
    .replace(/\{\{#issues\}\}\r?\n?([\s\S]*?)\{\{\/issues\}\}\r?\n?/g, (_m, body: string) =>
      renderRows(body, previous),
    )
    .replace(/\{\{#today\}\}\r?\n?([\s\S]*?)\{\{\/today\}\}\r?\n?/g, (_m, body: string) =>
      renderRows(body, ctx.todayIssues ?? []),
    )

  for (const [key, value] of Object.entries(scalars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  // Fallback for templates written before {{#today}} existed: append the
  // in-progress tasks after the last line. Only a *trailing empty bullet*
  // ("- ", however it is indented or spaced) is dropped so they sit cleanly
  // under "Today:" — a bullet that already has text is left alone, so editing
  // whitespace around the dash can no longer corrupt the output. The bullet's
  // own indentation is carried onto the appended lines, so spacing the "-" in
  // the template indents the tasks to match.
  if (ctx.todayIssues?.length && !hasTodayBlock) {
    const indent = out.match(/\n([ \t]*)-[ \t]*$/)?.[1] ?? ''
    const lines = ctx.todayIssues
      .map((i) => (ctx.showKey ? `${indent}- ${i.key} | ${i.summary}` : `${indent}- ${i.summary}`))
      .join('\n')
    const base = out.replace(/\n[ \t]*-[ \t]*$/, '').replace(/\s+$/, '')
    out = `${base}\n${lines}\n`
  }

  return out
}

export const DEFAULT_TEMPLATE = `Daily Report {{next_date}}

Previous day:
{{#issues}}
- {{key}} | {{summary}}
{{/issues}}
Today:
{{#today}}
- {{key}} | {{summary}}
{{/today}}
- `

export function toCsv(rows: Array<Record<string, string | number>>): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h] ?? '')).join(',')),
  ].join('\n')
}
