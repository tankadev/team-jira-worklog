/**
 * Team progress report: classification, rollup and the template language.
 *
 * Run: npx tsx tests/team-progress.mts
 *
 * Titles below are the shapes this Jira actually carries — inconsistent tags,
 * clones, bugs hanging off the epic — because that mess is the whole reason
 * this layer exists.
 */
import {
  DEFAULT_ENVS,
  DEFAULT_PLATFORMS,
  DEFAULT_TEMPLATE,
  EMPTY_SELECTION,
  type ProgressIssue,
  aggregatePercent,
  buildReportData,
  bugStats,
  commonEnv,
  epicKind,
  lostMarks,
  phaseOf,
  plainTitle,
  platformsFromTitle,
  supersededKeys,
  taskProgress,
  unbackedFigures,
} from '@/lib/modules/team-progress/model'
import { renderTemplate, templateProblem } from '@/lib/modules/team-progress/template'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got:', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}

/* ── template language ──────────────────────────────────────────────────── */
eq(renderTemplate('Hi {{name}}', { name: 'Leon' }), 'Hi Leon', 'a variable is substituted')
eq(renderTemplate('{{missing}}x', {}), 'x', 'a missing variable renders empty')
eq(
  renderTemplate('{{#items}}\n- {{name}}\n{{/items}}\nend', { items: [{ name: 'a' }, { name: 'b' }] }),
  '- a\n- b\nend',
  'standalone section lines leave no blank lines behind',
)
eq(
  renderTemplate('{{#xs}}\n  - {{.}}{{v}}\n{{/xs}}', { xs: [{ v: 1 }] }),
  '  - 1\n',
  'indentation inside a section is kept',
)
eq(renderTemplate('a{{#on}} (x){{/on}}b', { on: '' }), 'ab', 'an empty string hides an inline section')
eq(renderTemplate('{{#n}}has{{/n}}{{^n}}none{{/n}}', { n: 0 }), 'none', 'zero is empty — {{#bug_total}} hides when no bugs')
eq(renderTemplate('{{#e}}{{#t}}{{p}}/{{name}};{{/t}}{{/e}}', { p: 'top', e: [{ name: 'E', t: [{ name: 'T' }] }] }),
   'top/T;', 'lookups walk outward through nested sections, innermost first')
eq(templateProblem('{{#a}}x'), 'Thiếu {{/a}}', 'an unclosed section is reported')
eq(templateProblem('{{#a}}{{/b}}'), 'Khối {{#a}} đóng nhầm bằng {{/b}}', 'a mismatched close is reported')
eq(templateProblem(DEFAULT_TEMPLATE), null, 'the default template parses')

/* ── platforms from title tags ──────────────────────────────────────────── */
const P = DEFAULT_PLATFORMS
eq(platformsFromTitle('[CTALK][Web/Desktop] Unread Counter', P), ['Web/Desktop'], 'Web/Desktop is one platform')
eq(platformsFromTitle('[CTALK][iOS Lite][SDK] Implement', P), ['iOS'], 'iOS Lite and SDK both mean iOS, counted once')
eq(platformsFromTitle('[Bug][iOS][Lite] Kill app', P), ['iOS'], 'the [iOS][Lite] split spelling is iOS')
eq(platformsFromTitle('[CTALK][Admin BO] Fighting', P), ['Admin'], '[Admin BO] is Admin')
eq(platformsFromTitle('[CTALK][AdminBO][Document FR] X', P), ['Admin'], '[AdminBO] is Admin')
eq(platformsFromTitle('[CTALK][Backend][Packages] X', P), ['BE'], 'Backend and Packages are BE')
eq(platformsFromTitle('[CTALK][Test] Verify', P), [], '[Test] names no platform')
eq(platformsFromTitle('[X][Web/iOS] both', P), ['Web/Desktop', 'iOS'], 'a combined tag is split when it is not one alias')

/* ── phase ──────────────────────────────────────────────────────────────── */
const ph = (summary: string, typeName = 'Task') => phaseOf({ summary, typeName })
eq(ph('[Bug][Web] Input', 'Bug'), 'bug', 'Bug is the issue type')
eq(ph('[Improve] Show menu', 'Improve'), 'improve', 'Improve is the issue type')
eq(ph('[CTALK][Web][Document FR] Viết tài liệu'), 'document', '[Document FR] is document')
eq(ph('[CTALK][Doc][FR] - Bot Form'), 'document', '[Doc][FR] is document')
eq(ph('[CTALK][iOS Lite] Viết tài liệu Technical Details'), 'document', '"tài liệu" in the title is document')
eq(ph('[CTalk][Web/Desktop] Enforce Minimum OS Version - Documentation Phase 1'), 'document', '"Documentation" in the title is document')
eq(ph('[CTALK][Research][BE] QR Login'), 'research', '[Research] is research')
eq(ph('[CTALK][Test] Create Testcase'), 'test', '[Test] is QC test')
eq(ph('[CTALK][iOS Lite] Seft Test Implement Tasks'), 'selftest', 'the misspelt "Seft Test" is self test')
eq(ph('[CTALK][iOS Lite] Tự kiểm thử trên thiết bị'), 'selftest', '"Tự kiểm thử" is self test')
eq(ph('[CTALK][SPT-71][Support] Review các pull request'), 'support', '[Support] is support')
eq(ph('[CTALK][Web] Media Event Backfill'), 'implement', 'an untagged dev task is implement')

/* ── epics and titles ───────────────────────────────────────────────────── */
eq(epicKind('[CTALK][W41/2026] Improvements'), 'bucket', 'weekly bucket')
eq(epicKind('[CTALK][SPT-71] Sprint 71'), 'support', 'sprint support bucket')
eq(epicKind('[CTALK] Improve Workspace Security'), 'feature', 'a feature epic')
eq(plainTitle('CLONE - [CTALK][Web/Desktop] Unread Counter (Per Folder)'), 'Unread Counter (Per Folder)',
   'tags and the clone marker come off')

/* ── task progress ──────────────────────────────────────────────────────── */
const sub = (statusName: string) => ({ key: 'S', statusName })
const issue = (o: Partial<ProgressIssue> & { key: string }): ProgressIssue => ({
  summary: o.key, typeName: 'Task', statusName: 'In Progress', assignee: null, storyPoints: null,
  epicKey: 'E-1', inSprint: true, sprints: [], clones: [], subtasks: [], ...o,
})
eq(taskProgress(issue({ key: 'A', subtasks: [sub('Done'), sub('Done'), sub('In Progress'), sub('To Do')] })).percent, 63,
   'in progress: done subtasks count whole, a subtask underway counts half')
eq(taskProgress(issue({ key: 'A', subtasks: [sub('In Progress'), sub('In Progress')] })).percent, 50,
   'every subtask underway is 50%, not 0% — work has started')
eq(taskProgress(issue({ key: 'A', subtasks: [sub('COMMITED CODE FEATURE BRANCH'), sub('To Do')] })).percent, 38,
   'committed code counts three quarters')
eq(taskProgress(issue({ key: 'A', subtasks: [sub('Done'), sub('In Progress'), sub('To Do')] })).subtasksActive, 1,
   'subtasks underway are counted apart from done ones')
eq(taskProgress(issue({ key: 'A', statusName: 'READY TO TEST ON DEVELOP', subtasks: [sub('To Do')] })).percent, 100,
   'handed to test is 100% whatever the subtasks say')
eq(taskProgress(issue({ key: 'A', statusName: 'To Do' })).percent, 0, 'untouched To Do is 0%')
eq(taskProgress(issue({ key: 'A' })).percent, 50, 'in progress with no subtasks is measured by its own status')
eq(taskProgress(issue({ key: 'A', statusName: 'COMMITED CODE FEATURE BRANCH' })).percent, 75, 'a committed task with no subtasks is 75%')
eq(aggregatePercent([
  issue({ key: 'A', storyPoints: 3, statusName: 'Done' }),
  issue({ key: 'B', storyPoints: 1, statusName: 'To Do' }),
]), 75, 'the epic figure is weighted by points')
eq(aggregatePercent([]), null, 'no tasks gives no figure')

/* ── bugs ───────────────────────────────────────────────────────────────── */
const bs = bugStats([
  { statusName: 'Done' }, { statusName: 'VERIFIED ON INTEGRATION' }, { statusName: 'READY TO TEST ON DEVELOP' },
  { statusName: 'In Progress' }, { statusName: 'To Do' }, { statusName: 'COMMITED CODE FEATURE BRANCH' },
])
eq([bs.fixed, bs.total, bs.done, bs.verified, bs.testing, bs.inProgress, bs.todo], [2, 6, 1, 1, 1, 2, 1],
   'fixed is Verified + Done; the rest are split by stage')

/* ── environment ────────────────────────────────────────────────────────── */
eq(commonEnv([{ statusName: 'VERIFIED ON STAGING' }, { statusName: 'READY TO TEST ON INTEGRATION' }], DEFAULT_ENVS),
   'Integration', 'the lowest environment every item reached')
eq(commonEnv([{ statusName: 'READY TO TEST ON STAGING' }, { statusName: 'Done' }], DEFAULT_ENVS), 'Staging',
   'Done items do not hold the environment back')
eq(commonEnv([{ statusName: 'READY TO TEST ON STAGING' }, { statusName: 'In Progress' }], DEFAULT_ENVS), '',
   'anything still in development means no environment')

/* ── clones ─────────────────────────────────────────────────────────────── */
eq([...supersededKeys([issue({ key: 'NEW', clones: ['OLD'] }), issue({ key: 'OLD', statusName: 'Done' })])], ['OLD'],
   'the original of a clone drops out')
eq([...supersededKeys([issue({ key: 'NEW', clones: ['ELSEWHERE'] })])], [], 'a clone of something not shown changes nothing')

/* ── a whole report ─────────────────────────────────────────────────────── */
const data = buildReportData({
  platform: 'Web/Desktop',
  date: '2026-10-05',
  sprintName: 'CTALK-TEAM Sprint 71',
  epics: [
    { key: 'E-1', summary: '[CTALK][Web/Desktop] Unread Counter', statusName: 'In Progress' },
    { key: 'E-2', summary: '[CTALK][W39/2026] Improvements', statusName: 'To Do' },
  ],
  issues: [
    issue({ key: 'D', summary: '[CTALK][Web/Desktop][Document FR] Mô tả', statusName: 'Done' }),
    issue({ key: 'I', summary: '[CTALK][Web/Desktop] Implement', subtasks: [sub('Done'), sub('Done'), sub('Done'), sub('In Progress')] }),
    issue({ key: 'B1', summary: '[Bug][Web] a', typeName: 'Bug', statusName: 'Done' }),
    issue({ key: 'B2', summary: '[Bug][Web] b', typeName: 'Bug', statusName: 'In Progress' }),
    issue({ key: 'W1', epicKey: 'E-2', summary: '[Bug][Web] c', typeName: 'Bug', statusName: 'READY TO TEST ON STAGING' }),
    issue({ key: 'W2', epicKey: 'E-2', summary: '[Bug][BE] d', typeName: 'Bug', statusName: 'VERIFIED ON STAGING' }),
  ],
  selection: { ...EMPTY_SELECTION, notes: { 'E-1': 'đang review' } },
  platforms: P,
  envs: DEFAULT_ENVS,
  prs: [{ repo: 'o/web', number: 7, title: 'feat: unread bar', url: '', mergedAt: '', author: '', keys: ['I'], base: 'develop' }],
})
eq(data.epics[0].deployed, 'Develop', 'a PR naming a task marks its epic deployed')
eq(
  renderTemplate(DEFAULT_TEMPLATE, data),
  `Web/Desktop - 05/10/2026

- Unread Counter - đang review
 + Document: 100%
 + Implement: 88%
 + Fix: 1/2

- Improvements W39/2026 (Deploy Staging)
 + Web/Desktop: 1
 + BE: 1

🚀 Đã deploy lên môi trường CTalk-Develop:
 - N/A

🚀 Đã deploy lên môi trường Develop:
 - feat: unread bar

🚀 Đã deploy lên môi trường Staging:
 - N/A

`,
  'the default template reproduces the report the team writes by hand',
)

/* ── checking edits ─────────────────────────────────────────────────────── */
eq(unbackedFigures('Implement: 90% · Fix: 1/2 — 05/10/2026', 'Implement: 88% Fix: 1/2'), ['90%'],
   'a changed figure is flagged; a matching one and a date are not')

eq(lostMarks('- A\n- B (Deploy Staging)', '- A (Deploy Staging)\n- B (Deploy Staging)'), ['(Deploy Staging)'],
   'one of two identical environment marks dropped is reported')
eq(lostMarks('- A (Deploy Develop)', '- A (Deploy Develop)'), [], 'a kept mark is not reported')

console.log(bad ? `\n${bad}/${n} failed` : `team-progress: ${n} passed`)
if (bad) process.exit(1)
