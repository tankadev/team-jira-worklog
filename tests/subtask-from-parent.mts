/**
 * Building a subtask from its parent — "Tạo nhanh từ task cha".
 *
 * Run: npx tsx tests/subtask-from-parent.mts
 *
 * The parent's title arrives with its own prefixes; every case here is a way a
 * copied title could end up carrying two team tags or two sprint numbers.
 */
import { defaultSubtaskDates, subtaskFromParent, subtaskPointsFrom } from '@/lib/subtask-from-parent'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got:', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}

const opts = {
  prefixes: ['[Support]', '[Mobile]', '[BE]', '[Web]', '[Desktop]'],
  teamPrefix: '[CTALK]',
  sprintPattern: '[spt {n}]',
}

eq(
  subtaskFromParent('[CTALK][SPT-71][Support] Review các pull request', opts),
  { title: 'Review các pull request', picked: ['[Support]'] },
  'team and a differently-written sprint tag are dropped, known chip picked',
)
eq(
  subtaskFromParent('CLONE - [CTALK][Web] Update code các file', opts),
  { title: 'Update code các file', picked: ['[Web]'] },
  'Jira clone marker is stripped',
)
eq(
  subtaskFromParent('[ctalk][spt 70][web][Desktop] Fix crash', opts),
  { title: 'Fix crash', picked: ['[Web]', '[Desktop]'] },
  'matching ignores case and returns the configured spelling',
)
eq(
  subtaskFromParent('[CTALK][QA][Web] Kiểm tra form', opts),
  { title: '[QA] Kiểm tra form', picked: ['[Web]'] },
  'an unknown tag stays in the title rather than being lost',
)
eq(
  subtaskFromParent('Plain title without tags', opts),
  { title: 'Plain title without tags', picked: [] },
  'untagged title passes through',
)
eq(
  subtaskFromParent('[CTALK] - Bug: login fails', opts),
  { title: 'Bug: login fails', picked: [] },
  'separator after the tags is dropped',
)

eq(defaultSubtaskDates('2026-10-02', '2026-10-10', '2026-10-15'), { startDate: '2026-10-02', dueDate: '2026-10-10' }, 'parent due wins')
eq(defaultSubtaskDates('2026-10-02', null, '2026-10-15'), { startDate: '2026-10-02', dueDate: '2026-10-15' }, 'sprint end as fallback')
eq(defaultSubtaskDates('2026-10-12', '2026-10-10', null), { startDate: '2026-10-12', dueDate: '2026-10-12' }, 'due never before start')

eq(subtaskPointsFrom(2, 1), 2, 'valid parent estimate carried')
eq(subtaskPointsFrom(26, 1), 1, 'parent sum above 3 falls back')
eq(subtaskPointsFrom(null, 1), 1, 'no estimate falls back')

console.log(bad ? `${bad}/${n} failed` : `all ${n} ok`)
if (bad) process.exit(1)
