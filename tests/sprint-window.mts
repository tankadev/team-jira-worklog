/**
 * Which sprint a day belongs to, gaps between sprints included.
 *
 * Run: npx tsx tests/sprint-window.mts
 */
import { sprintForDate } from '@/lib/sprint-window'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got:', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}

// Sprint 71 closes Friday 30/10, sprint 72 opens Monday 02/11. The weekend
// between them is the user's overtime on sprint 71.
const s70 = { id: 70, start: '2026-10-05', end: '2026-10-16' }
const s71 = { id: 71, start: '2026-10-19', end: '2026-10-30' }
const s72 = { id: 72, start: '2026-11-02', end: '2026-11-13' }
const future = { id: 73, start: null, end: null }
const sprints = [future, s72, s70, s71]

eq(sprintForDate(sprints, '2026-10-30')?.id, 71, 'last day of a sprint')
eq(sprintForDate(sprints, '2026-10-31')?.id, 71, 'Saturday after the sprint → the sprint that just ended')
eq(sprintForDate(sprints, '2026-11-01')?.id, 71, 'Sunday before the next sprint → still the old one')
eq(sprintForDate(sprints, '2026-11-02')?.id, 72, 'first day of the next sprint')
eq(sprintForDate(sprints, '2026-10-17')?.id, 70, 'an earlier gap belongs to its own sprint')
eq(sprintForDate(sprints, '2026-11-20')?.id, 72, 'after the last dated sprint → the last one')
eq(sprintForDate(sprints, '2026-10-01'), null, 'before every sprint → none')
eq(sprintForDate([future], '2026-10-31'), null, 'no dated sprint at all → none')

// Two sprints overlap (the PM reopened one): the later start wins, like the
// server's "current" pick.
const over = [{ id: 1, start: '2026-10-01', end: '2026-10-31' }, { id: 2, start: '2026-10-19', end: '2026-10-30' }]
eq(sprintForDate(over, '2026-10-20')?.id, 2, 'overlap → most recently started')

console.log(bad ? `${bad}/${n} failed` : `all ${n} ok`)
if (bad) process.exit(1)
