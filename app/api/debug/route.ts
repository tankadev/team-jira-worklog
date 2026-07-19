import { getMyself } from '@/lib/jira/client'
import { getBoard } from '@/lib/jira/issues'
import { getProjectMeta } from '@/lib/jira/meta'
import { getSprints } from '@/lib/jira/sprints'
import { getWorklogs, sumByDate } from '@/lib/jira/worklog'
import { todayIn, weekOf } from '@/lib/time'

export const runtime = 'nodejs'

/**
 * Development-only smoke test for the Jira layer. `server-only` (correctly)
 * prevents these modules from being exercised by a plain script, so this route
 * is how they get run against the live instance. Read-only.
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 })
  }

  const url = new URL(request.url)
  const refresh = url.searchParams.get('refresh') === '1'

  try {
    const me = await getMyself()
    const meta = await getProjectMeta({ refresh })
    const { sprints, current } = await getSprints()

    const today = todayIn(me.timeZone)
    const week = weekOf(today)
    const worklogs = await getWorklogs(week[0], week[6], me.accountId, me.timeZone)
    const byDate = sumByDate(worklogs)

    const board = await getBoard({ sprintId: current?.id ?? null })

    return Response.json({
      me: { accountId: me.accountId, displayName: me.displayName, timeZone: me.timeZone },
      meta: {
        style: meta.style,
        simplified: meta.simplified,
        sprintFieldId: meta.sprintFieldId,
        storyPointsFieldId: meta.storyPointsFieldId,
        storyPointsFieldName: meta.storyPointsFieldName,
        issueTypes: meta.issueTypes.map((t) => `${t.name}${t.subtask ? '*' : ''}(${t.hierarchyLevel})`),
      },
      sprints: {
        total: sprints.length,
        current: current && { id: current.id, name: current.name, start: current.startDate?.slice(0, 10), end: current.endDate?.slice(0, 10) },
        newest: sprints.slice(0, 5).map((s) => `${s.current ? '* ' : '  '}${s.name} ${s.state} ${(s.startDate ?? '').slice(0, 10)}→${(s.endDate ?? '').slice(0, 10)}`),
      },
      week: {
        range: `${week[0]} → ${week[6]}`,
        entries: worklogs.length,
        hoursByDate: Object.fromEntries([...byDate].map(([d, s]) => [d, +(s / 3600).toFixed(2)])),
      },
      board: {
        parents: board.length,
        subtasks: board.reduce((n, p) => n + p.subtasks.length, 0),
        groups: board.map((p) => ({
          parent: p.key,
          summary: p.summary.slice(0, 55),
          points: p.storyPoints,
          childTotal: p.childPointsTotal,
          mismatch: p.storyPoints !== null && p.storyPoints !== p.childPointsTotal,
          children: p.subtasks.map((s) => `${s.key} ${s.statusName} sp=${s.storyPoints}`),
        })),
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
