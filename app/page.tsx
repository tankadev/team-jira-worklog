import Link from 'next/link'
import { connection } from 'next/server'

import { JiraError, getMyself } from '@/lib/jira/client'
import { getBoard, getSprintTasks } from '@/lib/jira/issues'
import type { SprintTask } from '@/lib/jira/types'
import { getSprints } from '@/lib/jira/sprints'
import { getWorklogs, sumByDate, sumByIssue } from '@/lib/jira/worklog'
import { SETTING_KEYS, getSetting } from '@/lib/settings'
import { DEFAULT_TZ, formatDateVi, isWeekend, todayIn, weekOf } from '@/lib/time'

import { LinkPending } from './link-pending'
import { BoardFilters } from './board/filters'
import { NavDimmer, NavProvider } from './board/navigation'
import { CapacityBar } from './board/capacity'
import { DatePicker } from './board/date-picker'
import { EpicHeader, groupByEpic } from './board/epic-section'
import { ParentGroup } from './board/parent-group'
import { PendingTasks } from './board/pending-tasks'
import { SprintPanel } from './board/sprint-panel'
import { WeekPanel } from './board/week-panel'

export default async function BoardPage(props: PageProps<'/'>) {
  await connection()

  if (!getSetting(SETTING_KEYS.jiraApiToken)) return <NotConfigured />

  const sp = await props.searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  let me
  try {
    me = await getMyself()
  } catch (error) {
    return <ConnectionProblem error={error} />
  }

  const tz = me.timeZone ?? DEFAULT_TZ
  const date = one(sp.date) ?? todayIn(tz)
  // Default to every status: a subtask that just moved to Done still needs
  // its hours logged, and hiding it makes the board look empty.
  const status = one(sp.status) === 'open' ? 'open' : 'all'
  const search = one(sp.q) ?? ''
  const epicFilter = one(sp.epic) ?? ''
  const parentFilter = one(sp.parent) ?? ''

  const { sprints, current } = await getSprints()
  const sprintParam = one(sp.sprint)
  // Three states, not two: a specific sprint, every sprint, or a date that sits
  // outside every sprint — which must not silently fall back to "every".
  const noSprintMatch = sprintParam === 'none'
  const sprintId =
    sprintParam === 'all' || noSprintMatch
      ? null
      : sprintParam
        ? Number(sprintParam)
        : (current?.id ?? null)

  // With a sprint selected, statistics cover the whole sprint: a sprint runs two
  // weeks, so a single calendar week cannot show whether it is fully covered.
  const selectedSprint = sprints.find((s) => s.id === sprintId) ?? null
  const sprintStart = selectedSprint?.startDate?.slice(0, 10) ?? null
  const sprintEnd = selectedSprint?.endDate?.slice(0, 10) ?? null

  const weekDays = weekOf(date)
  const rangeFrom = sprintStart ?? weekDays[0]
  const rangeTo = sprintEnd ?? weekDays[6]

  const [board, entries, sprintTasks] = await Promise.all([
    noSprintMatch ? Promise.resolve([]) : getBoard({ sprintId, status, search }),
    getWorklogs(
      // The selected day can sit outside the sprint window; widen so its own
      // logged hours still show on the capacity bar.
      date < rangeFrom ? date : rangeFrom,
      date > rangeTo ? date : rangeTo,
      me.accountId,
      tz,
    ),
    noSprintMatch ? Promise.resolve([]) : getSprintTasks(sprintId, status),
  ])
  const week = { days: weekDays, entries }

  const byDate = sumByDate(week.entries)
  const byIssueToday = sumByIssue(week.entries.filter((e) => e.date === date))

  for (const group of board) {
    for (const st of group.subtasks) st.loggedTodaySeconds = byIssueToday.get(st.key) ?? 0
  }

  const epicOptions = [
    ...new Map(
      board
        .filter((g) => g.epicKey)
        .map((g) => [g.epicKey!, { key: g.epicKey!, name: g.epicName ?? g.epicKey! }]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const parentOptions = board
    .filter((g) => g.key !== '__orphan__' && (!epicFilter || g.epicKey === epicFilter))
    .map((g) => ({ key: g.key, summary: g.summary }))

  const visibleBoard = board.filter(
    (g) =>
      (!epicFilter || g.epicKey === epicFilter) && (!parentFilter || g.key === parentFilter),
  )

  const coveredParents = new Set(board.map((g) => g.key))
  const uncovered = sprintTasks
    .filter((t) => !coveredParents.has(t.key))
    // Same epic together, matching how the board above is grouped.
    .filter((t) => !epicFilter || t.epicKey === epicFilter)
    .filter((t) => !parentFilter || t.key === parentFilter)
    // Same epic together, matching how the board above is grouped.
    .sort((a, b) => (a.epicKey ?? 'zz').localeCompare(b.epicKey ?? 'zz') || a.key.localeCompare(b.key))

  const quota = Number(getSetting(SETTING_KEYS.dailyQuotaHours) ?? '8') || 8
  const weekendCounts = getSetting(SETTING_KEYS.weekendCountsToQuota) === 'true'
  const dayIsWeekend = isWeekend(date)
  const dayQuota = dayIsWeekend && !weekendCounts ? 0 : quota

  const isToday = date === todayIn(tz)
  const dateLabel = formatDateVi(date)
  const todaysEntries = week.entries.filter((e) => e.date === date)

  return (
    <NavProvider>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
            {current
              ? `${current.name} · ${current.startDate?.slice(8, 10)}/${current.startDate?.slice(5, 7)} – ${current.endDate?.slice(8, 10)}/${current.endDate?.slice(5, 7)} · đang chạy`
              : 'Không xác định được sprint hiện tại'}
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Task board</h1>
          <p className="mt-1 text-[12.5px] text-ink-3">
            Subtask đang giao cho <b className="font-medium text-ink-2">{me.displayName}</b> — dùng
            bộ lọc bên dưới để thu hẹp.
          </p>
        </div>
        <DatePicker
          date={date}
          label={dateLabel}
          sprintId={sprintId}
          sprints={sprints.map((s) => ({
            id: s.id,
            start: s.startDate?.slice(0, 10) ?? null,
            end: s.endDate?.slice(0, 10) ?? null,
          }))}
        />
      </header>

      {!isToday && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-ot/40 bg-ot-soft px-3.5 py-2 text-[12.5px] text-ot">
          <b className="font-mono font-semibold">{dateLabel}</b>
          <span>— giờ log sẽ ghi vào ngày này, không phải hôm nay.</span>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_296px]">
        <div>
          <CapacityBar
            date={date}
            quotaHours={dayQuota}
            isWeekend={dayIsWeekend}
            entries={todaysEntries.map((e) => ({
              key: e.issueKey,
              seconds: e.timeSpentSeconds,
            }))}
          />

          <BoardFilters
            sprints={sprints.map((s) => ({
              id: s.id,
              name: s.name,
              current: Boolean(s.current),
              start: s.startDate?.slice(0, 10) ?? null,
              end: s.endDate?.slice(0, 10) ?? null,
            }))}
            sprintId={sprintId}
            status={status}
            search={search}
            noSprintMatch={noSprintMatch}
            epics={epicOptions}
            epicKey={epicFilter}
            parents={parentOptions}
            parentKey={parentFilter}
          />

          <NavDimmer>
          {visibleBoard.length === 0 ? (
            <EmptyBoard
              sprintName={sprints.find((s) => s.id === sprintId)?.name}
              status={status}
              hasTasks={uncovered.length > 0}
              noSprintMatch={noSprintMatch}
              dateLabel={dateLabel}
            />
          ) : (
            <div className="flex flex-col gap-4">
              {groupByEpic(visibleBoard).map((epic) => (
                <div key={epic.key ?? '__none__'}>
                  <EpicHeader group={epic} />
                  <div className="flex flex-col gap-3">
                    {epic.parents.map((group) => (
                      <ParentGroup
                        key={group.key}
                        group={group}
                        date={date}
                        dateLabel={dateLabel}
                        isToday={isToday}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
            <PendingTasks tasks={uncovered} />
          </NavDimmer>
        </div>

        {selectedSprint && sprintStart && sprintEnd ? (
          <SprintPanel
            sprintName={selectedSprint.name}
            start={sprintStart}
            end={sprintEnd}
            today={todayIn(tz)}
            selectedDate={date}
            secondsByDate={Object.fromEntries(byDate)}
            quotaHours={quota}
            weekendCounts={weekendCounts}
          />
        ) : (
          <WeekPanel
            days={week.days}
            today={date}
            hoursByDate={Object.fromEntries([...byDate].map(([d, s]) => [d, s / 3600]))}
            quotaHours={quota}
            weekendCounts={weekendCounts}
          />
        )}
      </div>
    </NavProvider>
  )
}

/**
 * Shown when no subtask matches. The list of parent tasks lives in
 * <PendingTasks> below, which renders whether or not the board is empty — so
 * this only needs to explain the emptiness and point at the next move.
 */
function EmptyBoard({
  sprintName,
  status,
  hasTasks,
  noSprintMatch,
  dateLabel,
}: {
  sprintName?: string
  status: string
  hasTasks: boolean
  noSprintMatch: boolean
  dateLabel: string
}) {
  if (noSprintMatch) {
    return (
      <div className="rounded-[9px] border border-dashed border-line-strong bg-surface p-6 text-center">
        <p className="text-[13.5px]">
          <b className="font-mono font-semibold">{dateLabel}</b> không nằm trong sprint nào.
        </p>
        <p className="mx-auto mt-2 max-w-lg text-[12.5px] leading-relaxed text-ink-3">
          Ngày này rơi ngoài khoảng của mọi sprint trên board — thường là khoảng nghỉ giữa hai
          sprint. Chọn ngày khác, hoặc đổi bộ lọc sang{' '}
          <b className="font-medium text-ink-2">Mọi sprint</b> để xem hết task.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[9px] border border-dashed border-line-strong bg-surface p-6 text-center">
      <p className="text-[13.5px]">
        Không có task con nào đang giao cho bạn
        {sprintName ? ` trong ${sprintName}` : ''}
        {status === 'open' ? ' và chưa Done' : ''}.
      </p>
      <p className="mx-auto mt-2 max-w-lg text-[12.5px] leading-relaxed text-ink-3">
        {hasTasks ? (
          'Bạn có task cấp trên ở sprint này — xem danh sách bên dưới để tạo task con rồi log giờ.'
        ) : (
          <>
            Thử đổi sang <b className="font-medium text-ink-2">Mọi sprint</b>, hoặc sang màn{' '}
            <Link href="/find" className="text-accent-ink underline underline-offset-2">
              Tìm &amp; nhận task
            </Link>{' '}
            để nhận việc mới.
          </>
        )}
      </p>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="rounded-[9px] border border-line bg-surface p-[17px]">
      <div className="flex flex-wrap items-center gap-3">
        <i className="inline-block size-[6px] shrink-0 rounded-full bg-warn" />
        <span className="text-[13px]">Chưa có API token — vào Settings để điền.</span>
        <Link
          href="/settings"
          className="rounded-md border border-line-strong bg-surface px-[9px] py-1 text-[12.5px] hover:bg-surface-2"
        >
          <span className="inline-flex items-center gap-1.5">
            Mở Settings
            <LinkPending />
          </span>
        </Link>
      </div>
    </div>
  )
}

function ConnectionProblem({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error)
  const status = error instanceof JiraError ? error.status : undefined

  return (
    <div className="rounded-[9px] border border-crit/40 bg-crit-soft p-[17px]">
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.09em] text-crit">
        Không kết nối được Jira{status ? ` · HTTP ${status}` : ''}
      </div>
      <p className="text-[13px] text-ink">{message}</p>
      <Link
        href="/settings"
        className="mt-3 inline-block rounded-md border border-line-strong bg-surface px-[9px] py-1 text-[12.5px] hover:bg-surface-2"
      >
        <span className="inline-flex items-center gap-1.5">
          Kiểm tra Settings
          <LinkPending />
        </span>
      </Link>
    </div>
  )
}
