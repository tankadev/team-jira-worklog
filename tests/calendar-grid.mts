/**
 * Worklog calendar grid and day status.
 *
 * Run: npx tsx tests/calendar-grid.mts
 */
import { dayStatus, dayStatusText, monthGrid, shiftMonth } from '@/lib/calendar-grid'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got:', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}

const oct = monthGrid('2026-10')
eq(oct.length, 42, 'six weeks')
eq(oct[0], '2026-09-28', 'starts on the Monday before the 1st (Thu)')
eq(oct.includes('2026-10-31'), true, 'covers the whole month')
eq(monthGrid('2026-06')[0], '2026-06-01', 'a month starting on Monday starts on the 1st')

eq(shiftMonth('2026-01', -1), '2025-12', 'previous month across a year')
eq(shiftMonth('2026-12', 1), '2027-01', 'next month across a year')

eq(dayStatus(0, 8), 'empty', 'nothing logged')
eq(dayStatus(4 * 3600, 8), 'short', 'half a day')
eq(dayStatus(8 * 3600 - 30, 8), 'full', 'seconds of rounding still full')
eq(dayStatus(9 * 3600, 8), 'over', 'overtime')
eq(dayStatus(0, 0), 'off', 'weekend, nothing logged')
eq(dayStatus(3600, 0), 'over', 'weekend work is overtime')

eq(dayStatusText(6 * 3600, 8), 'còn thiếu 2h', 'short text')
eq(dayStatusText(8 * 3600, 8), 'đủ 8h ✓', 'full text')
eq(dayStatusText(9.5 * 3600, 8), 'vượt 1h 30m (OT)', 'over text')

console.log(bad ? `${bad}/${n} failed` : `all ${n} ok`)
if (bad) process.exit(1)
