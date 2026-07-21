import { addDays, formatDuration } from './time'

export interface ReportIssue {
  key: string
  summary: string
  seconds: number
}

export interface ReportContext {
  /** Date the report covers, YYYY-MM-DD. */
  date: string
  issues: ReportIssue[]
  totalSeconds: number
  displayName?: string
  sprintName?: string
  /** Show the Jira issue key on each line. Off by default. */
  showKey?: boolean
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
    next_date: ddmmyyyy(addDays(ctx.date, 1)),
    date_iso: ctx.date,
    total: formatDuration(ctx.totalSeconds),
    total_hours: (ctx.totalSeconds / 3600).toFixed(ctx.totalSeconds % 3600 === 0 ? 0 : 2),
    count: String(ctx.issues.length),
    name: ctx.displayName ?? '',
    sprint: ctx.sprintName ?? '',
  }

  // Repeated block first, so scalars inside it resolve per issue.
  let out = template.replace(
    /\{\{#issues\}\}\r?\n?([\s\S]*?)\{\{\/issues\}\}\r?\n?/g,
    (_match, body: string) =>
      ctx.issues
        .map((issue) =>
          (ctx.showKey
            ? body.replace(/\{\{key\}\}/g, issue.key)
            : body.replace(KEY_WITH_SEP, ''))
            .replace(/\{\{summary\}\}/g, issue.summary)
            .replace(/\{\{time\}\}/g, formatDuration(issue.seconds))
            .replace(/\{\{hours\}\}/g, (issue.seconds / 3600).toFixed(2).replace(/\.?0+$/, '')),
        )
        .join(''),
  )

  for (const [key, value] of Object.entries(scalars)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
  }

  return out
}

export const DEFAULT_TEMPLATE = `Daily Report {{next_date}}

Previous day:
{{#issues}}
- {{key}} | {{summary}}
{{/issues}}
Today:
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
