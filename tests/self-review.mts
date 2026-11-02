/**
 * Personal sprint review figures.
 *
 * Run: npx tsx tests/self-review.mts
 */
import { fmtNum, hoursPerPoint, pct, reviewSprint, sizeOf, totalReviews } from '@/lib/modules/self-review/model'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got:', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}

eq(sizeOf(1), '1', '1 point')
eq(sizeOf(3), '3', '3 point')
eq(sizeOf(5), 'other', 'outside the team scale')
eq(sizeOf(0.5), 'other', 'fractional')
eq(sizeOf(null), 'none', 'unpointed')

const sprint = { id: 72, name: 'CTALK-TEAM Sprint 72', startDate: '2026-10-16T02:00:00.000Z', endDate: '2026-10-30T10:00:00.000Z', current: true }
const h = (hours: number) => hours * 3600
const rows = [
  { key: 'A', statusName: 'DONE', storyPoints: 1, timeSpentSeconds: h(2) },
  { key: 'B', statusName: 'DONE', storyPoints: 2, timeSpentSeconds: h(4) },
  { key: 'C', statusName: 'VERIFIED ON STAGING', storyPoints: 3, timeSpentSeconds: h(10) },
  { key: 'D', statusName: 'IN PROGRESS', storyPoints: 3, timeSpentSeconds: h(6) },
  { key: 'E', statusName: 'TO DO', storyPoints: 2, timeSpentSeconds: 0 },
  { key: 'F', statusName: 'READY TO TEST ON DEVELOP', storyPoints: 5, timeSpentSeconds: h(3) },
  { key: 'G', statusName: 'DONE', storyPoints: null, timeSpentSeconds: h(1) },
]
const r = reviewSprint(sprint, rows)

eq(r.label, 'S72', 'short label from the sprint number')
eq([r.start, r.end], ['2026-10-16', '2026-10-30'], 'dates trimmed to days')
eq([r.tasks, r.doneTasks], [7, 3], 'task counts')
eq(r.points, 16, 'every point, done or not')
eq([r.donePoints, r.verifiedPoints, r.activePoints, r.todoPoints], [3, 3, 8, 2], 'points by state')
eq(r.seconds, h(26), 'all hours')
eq(r.pointedSeconds, h(25), 'hours on estimated tasks only')
eq(r.sizes['1'], { tasks: 1, done: 1, points: 1 }, '1p bucket')
eq(r.sizes['2'], { tasks: 2, done: 1, points: 4 }, '2p bucket')
eq(r.sizes['3'], { tasks: 2, done: 0, points: 6 }, '3p bucket')
eq(r.sizes.other, { tasks: 1, done: 0, points: 5 }, 'other bucket')
eq(r.sizes.none, { tasks: 1, done: 1, points: 0 }, 'unpointed bucket')
eq(hoursPerPoint(r), 25 / 16, 'hours per point over estimated work')
eq(hoursPerPoint(reviewSprint(sprint, [])), null, 'no estimate → no ratio')

const empty = reviewSprint({ id: 1, name: 'Kanban' }, [])
eq(empty.label, 'Kanban', 'no number → full name')
eq(empty.tasks, 0, 'empty sprint')

const t = totalReviews([r, reviewSprint({ id: 71, name: 'Sprint 71' }, [
  { key: 'X', statusName: 'DONE', storyPoints: 3, timeSpentSeconds: h(9) },
])])
eq([t.sprints, t.tasks, t.doneTasks], [2, 8, 4], 'totals count')
eq([t.points, t.donePoints], [19, 6], 'totals points')
eq(t.avgDonePoints, 3, 'done points per sprint')
eq(t.sizes['3'], { tasks: 3, done: 1, points: 9 }, 'size totals merge')

eq(fmtNum(12), '12', 'integer')
eq(fmtNum(1.3333), '1.3', 'one decimal')
eq(pct(3, 16), 19, 'percent rounded')
eq(pct(1, 0), 0, 'percent of nothing')

console.log(bad ? `${bad}/${n} failed` : `all ${n} ok`)
if (bad) process.exit(1)
