import { getMyself } from '@/lib/jira/client'
import { getWorklogs } from '@/lib/jira/worklog'
import { toCsv } from '@/lib/report'
import { DEFAULT_TZ } from '@/lib/time'

export const runtime = 'nodejs'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const from = params.get('from')
  const to = params.get('to')

  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
    return new Response('Cần tham số from và to dạng YYYY-MM-DD', { status: 400 })
  }

  try {
    const me = await getMyself()
    const entries = await getWorklogs(from, to, me.accountId, me.timeZone ?? DEFAULT_TZ)

    const rows = entries
      .sort((a, b) => a.date.localeCompare(b.date) || a.issueKey.localeCompare(b.issueKey))
      .map((e) => ({
        date: e.date,
        issue: e.issueKey,
        summary: e.issueSummary,
        hours: (e.timeSpentSeconds / 3600).toFixed(2),
        seconds: e.timeSpentSeconds,
        started: e.started,
      }))

    // BOM so Excel opens the Vietnamese summaries as UTF-8 rather than mojibake.
    const csv = '﻿' + toCsv(rows)

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="worklog-${from}-${to}.csv"`,
      },
    })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Không xuất được CSV', {
      status: 500,
    })
  }
}
