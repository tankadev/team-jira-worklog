/**
 * Status colours — every status in the workflow must be told apart at a glance.
 *
 * Run: npx tsx tests/status-style.mts
 */
import { statusStyle } from '@/lib/status-style'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got:', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}

// The VT workflow, exactly as Jira spells it (mixed case included).
const workflow = [
  'To Do',
  'In Progress',
  'COMMITED CODE FEATURE BRANCH',
  'READY TO TEST ON DEVELOP',
  'READY TO TEST ON INTEGRATION',
  'READY TO TEST ON STAGING',
  'VERIFIED ON DEVELOP',
  'VERIFIED ON INTEGRATION',
  'VERIFIED ON STAGING',
  'Done',
  'BLOCKED',
]
const styles = workflow.map(statusStyle)
eq(new Set(styles).size, workflow.length, 'every workflow status has its own colour')

eq(statusStyle('Ready For Test On Develop'), 'st-rt-dev', 'the "for" spelling maps the same as "to"')
eq(statusStyle('in progress'), 'st-prog', 'case-insensitive')
eq(statusStyle('Some New Status'), statusStyle('SOME NEW STATUS'), 'unknown status: stable colour')

console.log(bad ? `${bad}/${n} failed` : `all ${n} ok`)
if (bad) process.exit(1)
