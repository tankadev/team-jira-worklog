/**
 * Commit messages handed out by the subtask "Commit message" button.
 *
 * Run: npx tsx tests/commit-message.mts
 *
 * The copied text has to pass a Conventional Commits hook as is, whatever the
 * model or the user typed into the subject.
 */
import { cleanCommitSubject, composeCommitMessage, isCommitType } from '@/lib/commit-message'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got:', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}

eq(composeCommitMessage('fix', 'handle crash when opening settings', 'VT-2075'),
  'fix: handle crash when opening settings\n\nRef: VT-2075', 'header, blank line, Ref footer')
eq(composeCommitMessage('feat', 'add bot form checkbox', 'VT-2790', 'web'),
  'feat(web): add bot form checkbox\n\nRef: VT-2790', 'optional scope')

eq(cleanCommitSubject('fix: Handle crash.'), 'handle crash', 'type prefix, capital, period removed')
eq(cleanCommitSubject('feat(ui)!: Add dark mode'), 'add dark mode', 'scoped breaking prefix removed')
eq(cleanCommitSubject('[CTALK][Web] Update views/rooms'), 'update views/rooms', 'ticket tags removed')
eq(cleanCommitSubject('VT-2075 fix settings crash (VT-2075)'), 'fix settings crash', 'Jira keys removed')
eq(cleanCommitSubject('API client retries on 429'), 'API client retries on 429', 'leading acronym kept')
eq(cleanCommitSubject('first line\nsecond line'), 'first line', 'only the first line')

eq(isCommitType('fix'), true, 'known type')
eq(isCommitType('bugfix'), false, 'unknown type')

console.log(bad ? `${bad}/${n} failed` : `all ${n} ok`)
if (bad) process.exit(1)
