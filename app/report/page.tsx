import Link from 'next/link'
import { connection } from 'next/server'

import { getMyself, jiraBlockedBy } from '@/lib/jira/client'
import { getOpenSubtasks } from '@/lib/jira/issues'
import { getSprints } from '@/lib/jira/sprints'
import { getWorklogs, sumByDate } from '@/lib/jira/worklog'
import type { ReportIssue } from '@/lib/report'
import { listDaysOff } from '@/lib/days-off'
import { statusTone } from '@/lib/jira/types'
import { type QuotaRules, quotaForDate } from '@/lib/quota'
import { SETTING_KEYS, getSetting, getWorkSchedule } from '@/lib/settings'
import { getTemplate, listTemplates } from '@/lib/templates'
import { DEFAULT_TZ, formatDateVi, formatDuration, previousWorkday, todayIn, weekOf } from '@/lib/time'

import { JiraDown } from '../jira-down'
import { NavProvider } from '../board/navigation'
import { ReportDatePicker } from './date-picker'
import { ReportOutput } from './output'
import { WeekTable } from './week-table'

/**
 * Everything on this page comes from Jira, so a dropped VPN has nothing left to
 * render — which is why the whole body sits behind one boundary rather than
 * each fetch guarding itself. Only a connection failure is caught: anything
 * else is a real bug and has to keep looking like one.
 */
export default async function ReportPage(props: PageProps<'/report'>) {
  try {
    return await reportPage(props)
  } catch (error) {
    if (!jiraBlockedBy(error)) throw error
    return <JiraDown error={error} retryHref="/report" />
  }
}

async function reportPage(props: PageProps<'/report'>) {
  await connection()

  if (!getSetting(SETTING_KEYS.jiraApiToken)) {
    return (
      <div className="card p-5">
        <span className="text-body">Chưa cấu hình Jira — </span>
        <Link href="/settings" className="text-body text-accent-ink underline underline-offset-2">
          mở Settings
        </Link>
      </div>
    )
  }

  const sp = await props.searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  const me = await getMyself()
  const tz = me.timeZone ?? DEFAULT_TZ
  const date = one(sp.date) ?? todayIn(tz)
  const templateId = one(sp.template) ? Number(one(sp.template)) : undefined
  // Task keys are hidden unless explicitly turned on.
  const showKey = one(sp.key) === '1'

  const templates = listTemplates()
  const template = getTemplate(templateId)

  const days = weekOf(date)
  // The report is written for `date` ("today"); its "Previous day" block lists
  // what was actually logged on the last working day — Friday, for a Monday.
  const prevDate = previousWorkday(date)
  const { current } = await getSprints()

  // The sprint window can start before this week, so it is fetched separately
  // rather than derived from the week's entries.
  const sprintFrom = current?.startDate?.slice(0, 10)
  const sprintTo = current?.endDate?.slice(0, 10)

  // prevDate falls in the previous week when `date` is a Monday, so the fetch
  // reaches back to it; the extra days are harmless to the week table and stats.
  const [weekEntries, sprintEntries, openTasks] = await Promise.all([
    getWorklogs(prevDate < days[0] ? prevDate : days[0], days[6], me.accountId, tz),
    sprintFrom && sprintTo
      ? getWorklogs(sprintFrom, min(sprintTo, todayIn(tz)), me.accountId, tz)
      : Promise.resolve([]),
    getOpenSubtasks(current?.id ?? null),
  ])

  const dayEntries = weekEntries.filter((e) => e.date === date)
  const prevEntries = weekEntries.filter((e) => e.date === prevDate)

  // One line per issue, not per worklog: several entries on the same issue in a
  // day should read as a single item in the report. The "Previous day" block is
  // built from the last working day before the selected date.
  const byIssue = new Map<string, ReportIssue>()
  for (const e of prevEntries) {
    const existing = byIssue.get(e.issueKey)
    if (existing) existing.seconds += e.timeSpentSeconds
    else
      byIssue.set(e.issueKey, {
        key: e.issueKey,
        summary: e.issueSummary,
        seconds: e.timeSpentSeconds,
      })
  }
  const issues = [...byIssue.values()].sort((a, b) => a.key.localeCompare(b.key))

  // Distinct today's numbers for the sidebar — how much of the report day has
  // been logged so far.
  const dayIssueCount = new Set(dayEntries.map((e) => e.issueKey)).size
  const daySeconds = dayEntries.reduce((n, e) => n + e.timeSpentSeconds, 0)

  // Candidates for "Today", work in progress first — the likeliest picks sit
  // at the top. None are ticked; the user chooses.
  const TONE_ORDER = { prog: 0, todo: 1, test: 2, ver: 3, done: 4 } as const
  const todayCandidates = openTasks
    .map((t) => ({ ...t, tone: statusTone(t.statusName) }))
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
    .map((t) => ({ key: t.key, summary: t.summary, statusName: t.statusName }))

  const byDate = sumByDate(weekEntries)
  const rules: QuotaRules = {
    dailyHours: Number(getSetting(SETTING_KEYS.dailyQuotaHours) ?? '8') || 8,
    // A half day is measured off the clock rather than halved — this workplace
    // runs 09:00–18:00 around lunch, so its halves are three hours and five.
    schedule: getWorkSchedule(),
    weekendCounts: getSetting(SETTING_KEYS.weekendCountsToQuota) === 'true',
    daysOff: listDaysOff(prevDate < days[0] ? prevDate : days[0], days[6]),
  }
  const quota = rules.dailyHours

  const sprintDays = new Set(sprintEntries.map((e) => e.date))
  const sprintSeconds = sprintEntries.reduce((n, e) => n + e.timeSpentSeconds, 0)
  const sprintIssues = new Set(sprintEntries.map((e) => e.issueKey))

  const shortDays = days.filter((d) => {
    const q = quotaForDate(d, rules)
    return q > 0 && (byDate.get(d) ?? 0) < q * 3600
  })

  return (
    <NavProvider>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-ink-2">
            Dựng từ worklog thật trên Jira
          </div>
          <h1 className="text-title font-semibold tracking-tight">Daily report</h1>
        </div>
        <ReportDatePicker date={date} label={formatDateVi(date)} />
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_296px]">
        <div className="flex flex-col gap-4">
          {/* Keyed on the day: picks belong to one report, not to whichever day is shown next. */}
          <ReportOutput
            key={date}
            template={template?.body ?? ''}
            date={date}
            prevDate={prevDate}
            prevDayOff={!!rules.daysOff[prevDate]}
            displayName={me.displayName}
            sprintName={current?.name}
            previousIssues={issues}
            todayCandidates={todayCandidates}
            templates={templates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }))}
            templateId={template?.id ?? 0}
            showKey={showKey}
          />

          <section className="card p-5">
            <div className="mb-2.5 eyebrow text-ink-2">
              Tuần này
            </div>
            <WeekTable
              days={days}
              today={date}
              secondsByDate={Object.fromEntries(byDate)}
              rules={rules}
            />
          </section>
        </div>

        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-5">
          <section className="card p-5">
            <div className="mb-2.5 eyebrow text-ink-2">
              Ngày {formatDateVi(date)}
            </div>
            <Stat label="Số task" value={String(dayIssueCount)} />
            <Stat label="Tổng giờ" value={formatDuration(daySeconds)} />
            <Stat label="Số lần log" value={String(dayEntries.length)} />
          </section>

          {shortDays.length > 0 && (
            <section className="card p-5">
              <div className="mb-2.5 eyebrow text-ink-2">
                Ngày chưa đủ định mức
              </div>
              {shortDays.map((d) => (
                <Stat
                  key={d}
                  label={formatDateVi(d)}
                  value={`thiếu ${formatDuration(quotaForDate(d, rules) * 3600 - (byDate.get(d) ?? 0))}`}
                  tone="warn"
                />
              ))}
            </section>
          )}

          {current && (
            <section className="card p-5">
              <div className="mb-2.5 eyebrow text-ink-2">
                {current.name} tới nay
              </div>
              <Stat label="Đã log" value={formatDuration(sprintSeconds)} />
              <Stat label="Ngày có log" value={String(sprintDays.size)} />
              <Stat
                label="Trung bình / ngày"
                value={
                  sprintDays.size ? formatDuration(sprintSeconds / sprintDays.size) : '—'
                }
              />
              <Stat label="Task đã đụng" value={String(sprintIssues.size)} />
            </section>
          )}

          <section className="card p-5">
            <div className="mb-2.5 eyebrow text-ink-2">
              Xuất
            </div>
            <div className="flex flex-col gap-1.5">
              <a
                href={`/api/report/csv?from=${days[0]}&to=${days[6]}`}
                className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium text-center text-body hover:bg-surface-2"
              >
                CSV tuần này
              </a>
              {sprintFrom && sprintTo && (
                <a
                  href={`/api/report/csv?from=${sprintFrom}&to=${sprintTo}`}
                  className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium text-center text-body hover:bg-surface-2"
                >
                  CSV cả sprint
                </a>
              )}
            </div>
          </section>
        </aside>
      </div>
    </NavProvider>
  )
}

function min(a: string, b: string) {
  return a < b ? a : b
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'warn'
}) {
  return (
    <div className="flex justify-between gap-2.5 border-t border-line py-[5px] text-body first:border-t-0">
      <span>{label}</span>
      <b className={'font-mono font-medium tabular ' + (tone === 'warn' ? 'text-warn' : '')}>
        {value}
      </b>
    </div>
  )
}
