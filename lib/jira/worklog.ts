import 'server-only'

import { DEFAULT_TZ, endOfDay, hoursToSeconds, jiraStarted, startOfDay } from '../time'
import { SETTING_KEYS, getSetting, requireProjectKey } from '../settings'
import { type JiraIssue, jiraFetch, searchJql } from './client'

export interface WorklogEntry {
  id: string
  issueKey: string
  issueSummary: string
  timeSpentSeconds: number
  started: string
  /** Local date the entry belongs to, YYYY-MM-DD. */
  date: string
  comment?: string
}

interface RawWorklog {
  id: string
  started?: string
  timeSpentSeconds?: number
  author?: { accountId?: string }
  comment?: unknown
}

function escapeJql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function localDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

/**
 * Worklogs this user recorded between two dates, inclusive.
 *
 * Done in two passes because Jira has no "give me my worklogs" endpoint: JQL
 * finds the issues touched in the window, then each issue's worklogs are read
 * and filtered down to this author and these dates. `worklogDate` in JQL matches
 * any author, so the per-entry author check is what makes the result correct on
 * a shared issue.
 */
export async function getWorklogs(
  fromDate: string,
  toDate: string,
  accountId: string,
  tz = DEFAULT_TZ,
  /**
   * Issue ids currently on screen. Logging to an issue that had no worklog in
   * this window yet leaves it out of the JQL result until the index catches up,
   * so the hours appear to vanish right after a successful save. Passing the
   * ids forces Jira to reconcile them first.
   */
  reconcileIds: string[] = [],
): Promise<WorklogEntry[]> {
  const projectKey = requireProjectKey()

  const jql =
    `project = "${escapeJql(projectKey)}"` +
    ` AND worklogAuthor = currentUser()` +
    ` AND worklogDate >= "${fromDate}" AND worklogDate <= "${toDate}"` +
    ` ORDER BY updated DESC`

  const issues = await searchJql<JiraIssue>(jql, ['summary'], {
    limit: 200,
    reconcileIssues: reconcileIds,
  })
  if (!issues.length) return []

  const after = startOfDay(fromDate, tz) - 1
  const before = endOfDay(toDate, tz) + 1

  const entries = await Promise.all(
    issues.map(async (issue) => {
      const res = await jiraFetch<{ worklogs?: RawWorklog[] }>(
        `/rest/api/3/issue/${encodeURIComponent(issue.key)}/worklog` +
          `?startedAfter=${after}&startedBefore=${before}&maxResults=200`,
      )
      return (res.worklogs ?? [])
        .filter((w) => w.author?.accountId === accountId && w.started)
        .map<WorklogEntry>((w) => ({
          id: w.id,
          issueKey: issue.key,
          issueSummary: issue.fields.summary ?? '',
          timeSpentSeconds: w.timeSpentSeconds ?? 0,
          started: w.started!,
          date: localDate(w.started!, tz),
        }))
        .filter((w) => w.date >= fromDate && w.date <= toDate)
    }),
  )

  return entries.flat()
}

export function sumByDate(entries: WorklogEntry[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) out.set(e.date, (out.get(e.date) ?? 0) + e.timeSpentSeconds)
  return out
}

export function sumByIssue(entries: WorklogEntry[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of entries) out.set(e.issueKey, (out.get(e.issueKey) ?? 0) + e.timeSpentSeconds)
  return out
}

export interface CreateWorklogInput {
  issueKey: string
  hours: number
  date: string
  comment?: string
  /** Minutes past 09:00, used to keep same-day entries from sharing a timestamp. */
  sequence?: number
  tz?: string
}

function toAdf(text: string) {
  return {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  }
}

/**
 * Logs work against an issue.
 *
 * `notifyUsers=false` because logging several entries in a row would otherwise
 * email every watcher once per entry. The clock time is meaningless to this team
 * (only the daily total is checked), so entries start at 09:00 and step forward.
 */
export async function createWorklog(input: CreateWorklogInput) {
  const tz = input.tz ?? DEFAULT_TZ
  const body: Record<string, unknown> = {
    // Send exactly one of timeSpent / timeSpentSeconds — Jira rejects both.
    timeSpentSeconds: hoursToSeconds(input.hours),
    started: jiraStarted(input.date, tz, input.sequence ?? 0),
  }
  if (input.comment?.trim()) body.comment = toAdf(input.comment.trim())

  return jiraFetch<{ id: string; timeSpentSeconds: number }>(
    `/rest/api/3/issue/${encodeURIComponent(input.issueKey)}/worklog?notifyUsers=false&adjustEstimate=leave`,
    { method: 'POST', body },
  )
}

export async function deleteWorklog(issueKey: string, worklogId: string) {
  return jiraFetch(
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}?notifyUsers=false&adjustEstimate=leave`,
    { method: 'DELETE' },
  )
}
