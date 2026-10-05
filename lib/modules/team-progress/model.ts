/**
 * Team progress report — the pure half: how an issue is classified, how a
 * feature's progress is rolled up, and the data tree a report template is
 * rendered against. No database, no network, no `server-only`, so the client
 * workspace recomputes it live as boxes are ticked and tests can pin it.
 *
 * Jira here does not carry the structure a report needs. Platform and kind of
 * work live only in title tags, written inconsistently (`[Admin BO]`,
 * `[AdminBO]`, `[Admin]`); a feature is an epic that never sits in a sprint;
 * bugs hang off the epic, not the task they break; and unfinished work moves
 * to the next sprint as a clone. Everything below is the layer that reads
 * past that.
 */

import { statusTone } from '@/lib/jira/types'

/* ── input shape ─────────────────────────────────────────────────────────── */

export interface ProgressSubtask {
  key: string
  statusName: string
  /** Daily reports name the subtask a worklog went to, so matching needs it. */
  summary?: string
}

/** A standard-level issue (Task, Bug, Improve…) under an epic. */
export interface ProgressIssue {
  key: string
  summary: string
  typeName: string
  statusName: string
  assignee: string | null
  storyPoints: number | null
  /** Null when the issue hangs under no epic. */
  epicKey: string | null
  /** In the sprint the page is looking at. */
  inSprint: boolean
  /** Names of every sprint the issue has been in. */
  sprints: string[]
  /** Keys this issue is a clone of (Jira's "Cloners" link, outward side). */
  clones: string[]
  subtasks: ProgressSubtask[]
}

export interface ProgressEpic {
  key: string
  summary: string
  statusName: string
}

export const NO_EPIC = '__none__'

/* ── configuration ───────────────────────────────────────────────────────── */

/** One platform and the title tags that mean it. */
export interface PlatformAlias {
  platform: string
  aliases: string[]
}

export const DEFAULT_PLATFORMS: PlatformAlias[] = [
  { platform: 'Web/Desktop', aliases: ['web', 'desktop', 'web/desktop', 'webdesktop', 'electron'] },
  { platform: 'iOS', aliases: ['ios', 'ios lite', 'lite', 'classic', 'ios classic', 'mobile', 'sdk', 'matrixrustsdk'] },
  { platform: 'Android', aliases: ['android'] },
  { platform: 'BE', aliases: ['be', 'backend', 'packages', 'api'] },
  { platform: 'Admin', aliases: ['admin', 'adminbo', 'admin bo', 'bo'] },
]

/**
 * A deploy environment, as Jira's statuses name it and as git branches it.
 *
 * `statusToken` is matched inside a status name ("READY TO TEST ON
 * INTEGRATION"); `branch` is the base branch a PR merges into. Either may be
 * empty — CTalk dev has a branch but no status of its own, integration has a
 * status but nothing in this team merges to it directly. Ordered low → high.
 */
export interface DeployEnv {
  label: string
  branch: string
  statusToken: string
}

export const DEFAULT_ENVS: DeployEnv[] = [
  { label: 'CTalk-Develop', branch: 'ctalk/develop', statusToken: '' },
  { label: 'Develop', branch: 'develop', statusToken: 'DEVELOP' },
  { label: 'Integration', branch: '', statusToken: 'INTEGRATION' },
  { label: 'Staging', branch: 'staging', statusToken: 'STAGING' },
]

/* ── classification ──────────────────────────────────────────────────────── */

/** Every `[...]` tag in a title, in order: `[CTALK][iOS Lite] X` → `['CTALK', 'iOS Lite']`. */
export function titleTags(summary: string): string[] {
  return [...summary.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim()).filter(Boolean)
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Platforms named by a title's tags.
 *
 * A tag may name two at once (`Web/Desktop` is one platform here, but
 * `Web/iOS` would be two), so a tag that matches no alias whole is retried
 * split on `/` and `,`.
 */
export function platformsFromTitle(summary: string, platforms: PlatformAlias[]): string[] {
  const index = new Map<string, string>()
  for (const p of platforms) {
    index.set(norm(p.platform), p.platform)
    for (const a of p.aliases) index.set(norm(a), p.platform)
  }
  const found: string[] = []
  const add = (p: string | undefined) => {
    if (p && !found.includes(p)) found.push(p)
  }
  for (const tag of titleTags(summary)) {
    const whole = index.get(norm(tag))
    if (whole) add(whole)
    else for (const part of tag.split(/[\/,]/)) add(index.get(norm(part)))
  }
  return found
}

export type Phase = 'document' | 'research' | 'implement' | 'selftest' | 'test' | 'support' | 'bug' | 'improve'

export const PHASES: Array<{ id: Phase; label: string }> = [
  { id: 'document', label: 'Document' },
  { id: 'research', label: 'Research' },
  { id: 'implement', label: 'Implement' },
  { id: 'selftest', label: 'Self test' },
  { id: 'test', label: 'Test (QC)' },
  { id: 'support', label: 'Support' },
  { id: 'bug', label: 'Bug' },
  { id: 'improve', label: 'Improve' },
]

/**
 * What kind of work an issue is. Bug and Improve come from the issue type —
 * QC files them and their titles follow QC's own convention. Everything else
 * is a Task whose kind lives only in its title, so the tags are read first and
 * a few phrases the team writes without a tag after that. Implement is what is
 * left: an untagged dev task is building the thing.
 */
export function phaseOf(issue: { typeName: string; summary: string }): Phase {
  const type = norm(issue.typeName)
  if (type === 'bug') return 'bug'
  if (type === 'improve') return 'improve'

  const tags = titleTags(issue.summary).map(norm)
  const title = norm(issue.summary)
  const has = (re: RegExp) => tags.some((t) => re.test(t))

  // "Seft Test" is how it is spelled on half of them.
  if (/\b(self|seft|sefl)[ -]?test\b|tự kiểm thử/.test(title)) return 'selftest'
  if (has(/^(test|qc|verify)/)) return 'test'
  if (has(/^support$/)) return 'support'
  if (has(/^research$/) || /^research\b/.test(title.replace(/^(\[[^\]]*\]\s*)+/, ''))) return 'research'
  if (has(/^(doc|document|document fr|fr|frd|tdd)$/) || /\b(document(ing|ation)?|tài liệu|tdd|frd)\b/.test(title)) return 'document'
  return 'implement'
}

export type EpicKind = 'feature' | 'bucket' | 'support'

/**
 * Not every epic is a feature. Bugs found along the way are filed under a
 * weekly bucket (`[W41/2026] Improvements`) and review / support time under a
 * per-sprint one (`[SPT-71] Sprint 71`); neither has a "progress" in the
 * feature sense, so the report treats them differently.
 */
export function epicKind(summary: string): EpicKind {
  if (/\bW\d{1,2}\/\d{4}\b/i.test(summary)) return 'bucket'
  if (/\bSPT-\d+\b|\bSprint \d+\b/i.test(summary)) return 'support'
  return 'feature'
}

/**
 * A title without its tags and clone marker — what a person would call it.
 * `CLONE - [CTALK][Web] Fix X` → `Fix X`.
 */
export function plainTitle(summary: string): string {
  return summary
    .replace(/^\s*CLONE\s*-\s*/i, '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(CLONE\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–:]+/, '')
    .trim()
}

/**
 * What an epic is called in the report. Weekly buckets all read
 * "Improvements & Bug Fixes" once the tags come off; the week is the only
 * thing telling them apart, so it stays.
 */
export function epicName(summary: string): string {
  const plain = plainTitle(summary) || summary
  const week = epicKind(summary) === 'bucket' ? summary.match(/\bW\d{1,2}\/\d{4}\b/i)?.[0] : undefined
  return week ? `${plain} ${week}` : plain
}

/**
 * Issues another issue in the same set replaces.
 *
 * Unfinished work moves sprints by being cloned: `Implement X` Done in sprint
 * 70 and its clone In Progress in sprint 71 are one piece of work, and
 * counting both would report it twice — once finished. The clone is the live
 * one, so the original drops out.
 */
export function supersededKeys(issues: ProgressIssue[]): Set<string> {
  const present = new Set(issues.map((i) => i.key))
  const out = new Set<string>()
  for (const i of issues) for (const k of i.clones) if (present.has(k)) out.add(k)
  return out
}

/* ── progress ───────────────────────────────────────────────────────────── */

/** Finished as far as the developer is concerned: handed to test or beyond. */
export function isDevDone(statusName: string): boolean {
  const tone = statusTone(statusName)
  return tone === 'test' || tone === 'ver' || tone === 'done'
}

/** A bug counts as fixed once QC has verified it, or it is closed. */
export function isFixed(statusName: string): boolean {
  const tone = statusTone(statusName)
  return tone === 'ver' || tone === 'done'
}

/**
 * How much of one piece of work a status stands for, 0–1.
 *
 * Work in progress counts for half rather than nothing: reading a feature
 * whose every subtask is underway as "Implement 0%" told the reader nobody had
 * started. Committed code sits further along — written, waiting to be
 * deployed for test. Exact fractions are a convention, not a measurement;
 * they are kept here, in one place, so the report and the bars agree.
 */
export const STAGE_CREDIT = { todo: 0, inProgress: 0.5, committed: 0.75, done: 1 } as const

export function stageCredit(statusName: string): number {
  if (isDevDone(statusName)) return STAGE_CREDIT.done
  if (statusTone(statusName) === 'todo') return STAGE_CREDIT.todo
  if (/COMMIT/i.test(statusName)) return STAGE_CREDIT.committed
  return STAGE_CREDIT.inProgress
}

export interface TaskProgress {
  /** 0–100. Null only when there is nothing to measure. */
  percent: number | null
  subtasksDone: number
  /** Started but not handed to test yet — counted at partial credit. */
  subtasksActive: number
  subtasksTotal: number
}

/**
 * How far one task has got.
 *
 * Handed to test or later is 100% whatever the subtasks say. Otherwise the
 * subtasks decide, each by its stage (see {@link stageCredit}); a task with no
 * subtasks is measured by its own status the same way.
 */
export function taskProgress(issue: Pick<ProgressIssue, 'statusName' | 'subtasks'>): TaskProgress {
  const total = issue.subtasks.length
  const done = issue.subtasks.filter((s) => isDevDone(s.statusName)).length
  const active = issue.subtasks.filter((s) => stageCredit(s.statusName) > 0 && !isDevDone(s.statusName)).length
  const base = { subtasksDone: done, subtasksActive: active, subtasksTotal: total }
  if (isDevDone(issue.statusName)) return { percent: 100, ...base }
  if (total > 0) {
    const credit = issue.subtasks.reduce((sum, s) => sum + stageCredit(s.statusName), 0)
    return { percent: Math.round((credit / total) * 100), ...base }
  }
  return { percent: Math.round(stageCredit(issue.statusName) * 100), ...base }
}

export interface BugStats {
  total: number
  fixed: number
  done: number
  verified: number
  testing: number
  inProgress: number
  todo: number
}

export function bugStats(issues: Array<{ statusName: string }>): BugStats {
  const s: BugStats = { total: 0, fixed: 0, done: 0, verified: 0, testing: 0, inProgress: 0, todo: 0 }
  for (const i of issues) {
    const tone = statusTone(i.statusName)
    s.total++
    if (tone === 'done') s.done++
    else if (tone === 'ver') s.verified++
    else if (tone === 'test') s.testing++
    else if (tone === 'todo') s.todo++
    else s.inProgress++
  }
  s.fixed = s.done + s.verified
  return s
}

/**
 * One figure for a group of tasks — "Implement 65%".
 *
 * Weighted by story points where a task has them, so a 3-point task moves the
 * figure more than a 1-pointer; an unestimated task weighs 1. Tasks with no
 * measurable progress are left out of the average rather than counted as 0 —
 * when none is measurable the caller shows a status instead.
 */
export function aggregatePercent(issues: ProgressIssue[]): number | null {
  let weight = 0
  let sum = 0
  for (const i of issues) {
    const p = taskProgress(i).percent
    if (p === null) continue
    const w = i.storyPoints && i.storyPoints > 0 ? i.storyPoints : 1
    weight += w
    sum += p * w
  }
  return weight ? Math.round(sum / weight) : null
}

/** "90%", or the status the work is in when no figure can be given. */
export function progressText(issues: ProgressIssue[]): string {
  if (!issues.length) return ''
  const pct = aggregatePercent(issues)
  if (pct !== null) return `${pct}%`
  const open = issues.find((i) => !isDevDone(i.statusName)) ?? issues[0]
  return open.statusName
}

/**
 * The highest environment every issue has reached, read from statuses like
 * "READY TO TEST ON INTEGRATION". Empty when any issue is still in
 * development, or when nothing names an environment (all Done, say).
 */
export function commonEnv(issues: Array<{ statusName: string }>, envs: DeployEnv[]): string {
  if (!issues.length) return ''
  let lowest = Infinity
  for (const i of issues) {
    const tone = statusTone(i.statusName)
    if (tone === 'done') continue
    if (tone !== 'test' && tone !== 'ver') return ''
    const s = i.statusName.toUpperCase()
    const idx = envs.findIndex((e) => e.statusToken && s.includes(e.statusToken.toUpperCase()))
    if (idx === -1) return ''
    lowest = Math.min(lowest, idx)
  }
  return Number.isFinite(lowest) ? envs[lowest].label : ''
}

/* ── selection ───────────────────────────────────────────────────────────── */

/**
 * What the user picked for one report profile, remembered between days.
 *
 * Only issues the user has seen carry a decision; an issue that appeared
 * since is decided by the platform rule and flagged new, so a task added
 * yesterday neither sneaks into the report unseen nor silently drops out.
 */
export interface Selection {
  selected: string[]
  /** Every key the user has been shown, picked or not. */
  seen: string[]
  /** Per-issue phase correction, when the title misleads. */
  phases: Record<string, Phase>
  /** Per-epic free note — "Pending for new design". */
  notes: Record<string, string>
  /** Per-epic display name, shorter than the Jira summary. */
  names: Record<string, string>
}

export const EMPTY_SELECTION: Selection = { selected: [], seen: [], phases: {}, notes: {}, names: {} }

/**
 * The platforms an issue belongs to: its own tags, else its epic's. A
 * `[Test]` task with no platform tag inherits from the epic too.
 */
export function issuePlatforms(issue: ProgressIssue, epic: ProgressEpic | undefined, platforms: PlatformAlias[]): string[] {
  const own = platformsFromTitle(issue.summary, platforms)
  if (own.length) return own
  return epic ? platformsFromTitle(epic.summary, platforms) : []
}

/** Initial pick for an issue nobody has decided on yet. */
export function defaultPicked(issue: ProgressIssue, epic: ProgressEpic | undefined, platform: string, platforms: PlatformAlias[]): boolean {
  return issuePlatforms(issue, epic, platforms).includes(platform)
}

/* ── team dailies ───────────────────────────────────────────────────────── */

/**
 * One line of a pasted daily, and the Jira issue the AI matched it to.
 *
 * `key` is always a standard-level issue (a subtask match is lifted to its
 * task) so it lines up with the rows on screen; `subtaskKey` keeps what was
 * actually named. Null `key` means nothing on Jira fits — work nobody filed,
 * or another platform's.
 */
export interface DailyMatch {
  person: string
  /** Which half of the daily the line came from. */
  when: 'yesterday' | 'today' | 'other'
  line: string
  key: string | null
  subtaskKey: string | null
  reason: string
}

/* ── report data ─────────────────────────────────────────────────────────── */

export interface DeployPr {
  repo: string
  number: number
  title: string
  url: string
  mergedAt: string
  author: string
  /** Jira keys named in the title or body. */
  keys: string[]
  /** Branch it merged into, matching a DeployEnv's `branch`. */
  base: string
}

export interface BuildInput {
  platform: string
  /** YYYY-MM-DD. */
  date: string
  sprintName: string
  epics: ProgressEpic[]
  /** Only the issues to report on — already filtered to the picked ones. */
  issues: ProgressIssue[]
  selection: Selection
  platforms: PlatformAlias[]
  envs: DeployEnv[]
  /** PRs picked for the deploy section. */
  prs: DeployPr[]
  /** Subtask key → its parent's key, to place a PR that names a subtask. */
  subtaskParent?: Record<string, string>
}

function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function taskRow(i: ProgressIssue) {
  const p = taskProgress(i)
  return {
    key: i.key,
    name: plainTitle(i.summary),
    title: i.summary,
    status: i.statusName,
    assignee: i.assignee ?? '',
    progress: p.percent !== null ? `${p.percent}%` : i.statusName,
    percent: p.percent ?? '',
    subtasks: p.subtasksTotal ? `${p.subtasksDone}/${p.subtasksTotal}` : '',
    subtasks_active: p.subtasksActive,
    points: i.storyPoints ?? '',
  }
}

/**
 * The tree a template renders. Every name in it is documented in
 * TEMPLATE_VARIABLES; keep the two in step.
 */
export function buildReportData(input: BuildInput) {
  const { selection, envs } = input
  const epicByKey = new Map(input.epics.map((e) => [e.key, e]))
  const byEpic = new Map<string, ProgressIssue[]>()
  for (const i of input.issues) {
    const k = i.epicKey ?? NO_EPIC
    byEpic.set(k, [...(byEpic.get(k) ?? []), i])
  }

  // Where each PR lands: the epic of the task (or subtask's task) it names.
  const issueEpic = new Map(input.issues.map((i) => [i.key, i.epicKey ?? NO_EPIC]))
  const prEpicEnvs = new Map<string, string[]>()
  for (const pr of input.prs) {
    const env = envs.find((e) => e.branch && e.branch === pr.base)?.label
    if (!env) continue
    for (const k of pr.keys) {
      const epic = issueEpic.get(k) ?? issueEpic.get(input.subtaskParent?.[k] ?? '')
      if (!epic) continue
      const list = prEpicEnvs.get(epic) ?? []
      if (!list.includes(env)) list.push(env)
      prEpicEnvs.set(epic, list)
    }
  }

  const phaseFor = (i: ProgressIssue): Phase => selection.phases[i.key] ?? phaseOf(i)

  // Report order follows the epic list the caller passes (the workspace's own
  // order), with the no-epic group last.
  const order = [...input.epics.map((e) => e.key).filter((k) => byEpic.has(k)), ...(byEpic.has(NO_EPIC) ? [NO_EPIC] : [])]

  const epics = order.map((key) => {
    const epic = epicByKey.get(key)
    const issues = byEpic.get(key) ?? []
    const kind: EpicKind = epic ? epicKind(epic.summary) : 'support'
    const of = (p: Phase) => issues.filter((i) => phaseFor(i) === p)
    const bugs = of('bug')
    const improves = of('improve')
    const stats = bugStats(bugs)
    const work = issues.filter((i) => !['document', 'research', 'test', 'support'].includes(phaseFor(i)))

    // Per-platform counts of bugs and improves — how a weekly bucket is reported.
    const counts = new Map<string, { count: number; fixed: number }>()
    for (const i of [...bugs, ...improves]) {
      const ps = issuePlatforms(i, epic, input.platforms)
      for (const p of ps.length ? ps : ['Khác']) {
        const c = counts.get(p) ?? { count: 0, fixed: 0 }
        c.count++
        if (isFixed(i.statusName)) c.fixed++
        counts.set(p, c)
      }
    }

    const fullName = epic ? epicName(epic.summary) : 'Chưa có epic'
    return {
      key: key === NO_EPIC ? '' : key,
      epic: selection.names[key]?.trim() || fullName,
      epic_full: epic?.summary ?? 'Chưa có epic',
      epic_status: epic?.statusName ?? '',
      note: selection.notes[key]?.trim() ?? '',
      kind,
      is_feature: kind === 'feature',
      is_bucket: kind === 'bucket',
      is_support: kind === 'support',
      env: commonEnv(work, envs),
      deployed: (prEpicEnvs.get(key) ?? []).join(', '),
      tasks: issues.filter((i) => phaseFor(i) !== 'bug').map(taskRow),
      ...Object.fromEntries(
        PHASES.filter((p) => p.id !== 'bug').flatMap((p) => {
          const list = of(p.id)
          return [
            [p.id, progressText(list)],
            [`${p.id}_tasks`, list.map(taskRow)],
            [`${p.id}_done`, list.filter((i) => isDevDone(i.statusName)).length],
            [`${p.id}_count`, list.length],
          ]
        }),
      ),
      bugs: bugs.map(taskRow),
      bug_total: stats.total,
      bug_fixed: stats.fixed,
      bug_done: stats.done,
      bug_verified: stats.verified,
      bug_testing: stats.testing,
      bug_inprogress: stats.inProgress,
      bug_todo: stats.todo,
      bug_open: stats.total - stats.fixed,
      bug_status: [
        stats.done && `Done ${stats.done}`,
        stats.verified && `Verified ${stats.verified}`,
        stats.testing && `chờ test ${stats.testing}`,
        stats.inProgress && `đang fix ${stats.inProgress}`,
        stats.todo && `chưa làm ${stats.todo}`,
      ]
        .filter(Boolean)
        .join(' · '),
      breakdown: [...counts].map(([platform, c]) => ({ platform, count: c.count, fixed: c.fixed })),
    }
  })

  const deploys = envs
    .filter((e) => e.branch)
    .map((e) => ({
      env: e.label,
      branch: e.branch,
      prs: input.prs
        .filter((p) => p.base === e.branch)
        .map((p) => ({ title: p.title, number: p.number, repo: p.repo, url: p.url, keys: p.keys.join(', '), author: p.author })),
    }))

  return {
    platform: input.platform,
    date: ddmmyyyy(input.date),
    sprint: input.sprintName,
    epics,
    features: epics.filter((e) => e.is_feature),
    buckets: epics.filter((e) => e.is_bucket),
    supports: epics.filter((e) => e.is_support),
    deploys,
    has_deploys: deploys.some((d) => d.prs.length > 0),
  }
}

export type ReportData = ReturnType<typeof buildReportData>

/** Documented names, shown beside the template editor. */
export const TEMPLATE_VARIABLES: Array<[string, string]> = [
  ['{{platform}} {{date}} {{sprint}}', 'nền tảng, ngày (dd/mm/yyyy), tên sprint'],
  ['{{#epics}}…{{/epics}}', 'lặp từng epic đã chọn (hoặc {{#features}} / {{#buckets}} / {{#supports}})'],
  ['{{epic}} {{epic_full}} {{key}}', 'tên gọn (sửa được) · tên đầy đủ trên Jira · mã epic'],
  ['{{note}}', 'ghi chú tay của epic, ví dụ "Pending for new design"'],
  ['{{env}}', 'môi trường cao nhất mọi task/bug đã tới (theo status)'],
  ['{{deployed}}', 'môi trường có PR của epic merge trong khoảng đã chọn'],
  ['{{#is_feature}} {{#is_bucket}} {{#is_support}}', 'loại epic: tính năng · bug tuần (W41/2026) · support (SPT-71)'],
  ['{{document}} {{research}} {{implement}} {{selftest}} {{test}} {{support}} {{improve}}', 'tiến độ gộp của từng loại việc: "90%" hoặc tên status'],
  ['{{#implement_tasks}}…{{/implement_tasks}}', 'lặp từng task của một loại (đổi implement thành document, test…)'],
  ['{{implement_done}} {{implement_count}}', 'số task đã xong / tổng số task của loại đó'],
  ['{{#tasks}}…{{/tasks}}', 'mọi task không phải bug trong epic'],
  ['{{name}} {{status}} {{progress}} {{subtasks}} {{subtasks_active}} {{assignee}}', 'trong vòng lặp task: tên gọn, status, "90%", subtask xong "9/10", số subtask đang làm, người làm'],
  ['Cách tính %', 'To Do 0% · In Progress 50% · Commit code 75% · Ready to test / Verified / Done 100%; task có subtask thì lấy trung bình các subtask'],
  ['{{bug_fixed}}/{{bug_total}}', 'bug đã fix (Verified + Done) / tổng bug'],
  ['{{bug_done}} {{bug_verified}} {{bug_testing}} {{bug_inprogress}} {{bug_todo}} {{bug_open}}', 'đếm bug theo trạng thái'],
  ['{{bug_status}}', '"Done 6 · Verified 3 · chờ test 2 · đang fix 1"'],
  ['{{#bugs}}…{{/bugs}}', 'lặp từng bug (name, status…)'],
  ['{{#breakdown}}{{platform}}: {{count}}{{/breakdown}}', 'đếm bug + improve theo nền tảng ({{fixed}} = đã fix)'],
  ['{{#deploys}}…{{/deploys}}', 'từng môi trường có nhánh: {{env}}, {{#prs}}{{title}}{{/prs}}, {{^prs}}N/A{{/prs}}'],
  ['{{^name}}…{{/name}}', 'chỉ hiện khi name rỗng / bằng 0'],
]

export const DEFAULT_TEMPLATE = `{{platform}} - {{date}}
{{#epics}}

- {{epic}}{{#env}} (Deploy {{env}}){{/env}}{{#note}} - {{note}}{{/note}}
{{#document}}
 + Document: {{document}}
{{/document}}
{{#research}}
 + Research: {{research}}
{{/research}}
{{#implement}}
 + Implement: {{implement}}
{{/implement}}
{{#selftest}}
 + Self test: {{selftest}}
{{/selftest}}
{{#is_bucket}}
{{#breakdown}}
 + {{platform}}: {{count}}
{{/breakdown}}
{{/is_bucket}}
{{^is_bucket}}
{{#improve}}
 + Improve: {{improve}}
{{/improve}}
{{#bug_total}}
 + Fix: {{bug_fixed}}/{{bug_total}}
{{/bug_total}}
{{/is_bucket}}
{{/epics}}

{{#deploys}}
🚀 Đã deploy lên môi trường {{env}}:
{{#prs}}
 - {{title}}
{{/prs}}
{{^prs}}
 - N/A
{{/prs}}

{{/deploys}}`

/* ── checking an edited report ──────────────────────────────────────────── */

/** Figures a reader would take as facts: `90%` and `8/11`. */
export function reportFigures(text: string): string[] {
  return [...text.matchAll(/\b\d+(?:\.\d+)?\s*%|\b\d+\s*\/\s*\d+\b/g)].map((m) => m[0].replace(/\s+/g, ''))
}

/**
 * Figures in an edited or AI-written report that the data does not back.
 *
 * Not an error — the user may well have rounded 85% up to 90% on purpose —
 * but a model asked to tidy a report will now and then "fix" a number, and
 * that is invisible once it reads naturally. Full dates (`05/10/2026`) are
 * not figures and are skipped.
 */
export function unbackedFigures(text: string, source: string): string[] {
  const known = new Set(reportFigures(source))
  const out: string[] = []
  for (const f of reportFigures(text.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, ' '))) {
    if (!known.has(f) && !out.includes(f)) out.push(f)
  }
  return out
}

/**
 * Environment marks — "(Deploy Staging)" — present in the source but gone
 * from the edited text. A rewrite that tidies a line tends to drop the
 * parenthesis first, and a feature reported without its environment reads
 * as not deployed. Counted, so dropping one of two identical marks shows.
 */
export function lostMarks(text: string, source: string): string[] {
  const count = (s: string) => {
    const m = new Map<string, number>()
    for (const x of s.matchAll(/\(Deploy [^)]+\)/g)) m.set(x[0], (m.get(x[0]) ?? 0) + 1)
    return m
  }
  const have = count(text)
  return [...count(source)].filter(([mark, n]) => (have.get(mark) ?? 0) < n).map(([mark]) => mark)
}
