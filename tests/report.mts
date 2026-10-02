/**
 * Daily report rendering: the picked tasks, the "Off" line and the heading date.
 *
 * Run: npx tsx tests/report.mts
 */
import { DEFAULT_TEMPLATE, renderReport } from '@/lib/report'
import { previousWorkday } from '@/lib/time'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got:', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}

eq(previousWorkday('2026-10-05'), '2026-10-02', 'Monday looks back to Friday')
eq(previousWorkday('2026-10-04'), '2026-10-02', 'Sunday looks back to Friday')
eq(previousWorkday('2026-10-07'), '2026-10-06', 'midweek is the day before')

const issue = { key: 'VT-1', summary: 'Fix login', seconds: 7200 }
const today = [{ key: 'VT-2', summary: 'Build form', seconds: 0 }]

eq(
  renderReport(DEFAULT_TEMPLATE, { date: '2026-10-02', reportDate: '2026-10-05', issues: [issue], totalSeconds: 7200, todayIssues: today }),
  'Daily Report 05-10-2026\n\nPrevious day:\n- Fix login\nToday:\n- Build form\n- ',
  'Monday report headed with Monday, not Friday + 1',
)

eq(
  renderReport(DEFAULT_TEMPLATE, { date: '2026-10-02', reportDate: '2026-10-05', issues: [], totalSeconds: 0, previousOff: true, showKey: true }),
  'Daily Report 05-10-2026\n\nPrevious day:\n- Off\nToday:\n- ',
  'Off line carries no key separator, even with keys shown',
)

eq(
  renderReport('{{#issues}}- {{summary}} ({{time}})\n{{/issues}}', { date: '2026-10-02', issues: [], totalSeconds: 0, previousOff: true }),
  '- Off\n',
  'Off line drops the time',
)

eq(
  renderReport('{{#issues}}- {{summary}} ({{time}})\n{{/issues}}', { date: '2026-10-02', issues: [issue], totalSeconds: 7200, previousOff: true }),
  '- Fix login (2h)\n',
  'Off is ignored when there are logs',
)

eq(
  renderReport('{{#issues}}- {{key}} | {{summary}}\n{{/issues}}', { date: '2026-10-02', issues: [issue], totalSeconds: 7200, showKey: true }),
  '- VT-1 | Fix login\n',
  'keys still shown on real issues',
)

console.log(bad ? `${bad}/${n} failed` : `all ${n} ok`)
if (bad) process.exit(1)
