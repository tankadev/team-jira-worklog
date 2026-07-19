import 'server-only'

import { SETTING_KEYS, getSetting, requireProjectKey } from '../settings'
import { type JiraIssue, jiraFetch, searchJql } from './client'
import { getProjectMeta } from './meta'
import type { BoardParent, BoardSubtask, SprintTask, Transition } from './types'

export type { BoardParent, BoardSubtask, SprintTask, Transition } from './types'
export { statusTone } from './types'

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null
}

function escapeJql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export interface BoardQuery {
  sprintId?: number | null
  /** Substring match on summary or key. */
  search?: string
  /** 'open' hides Done, 'all' shows everything. */
  status?: 'open' | 'all'
}

/**
 * Keys of the standard-level issues sitting in a sprint.
 *
 * Needed because JQL cannot filter subtasks by sprint. A subtask *carries* a
 * sprint value when you read the field, but `sprint = X AND issuetype in
 * subTaskIssueTypes()` matches nothing — verified against this instance, and
 * true for `"Sprint"`, `sprint in (…)` and `cf[10020]` alike. So the sprint is
 * resolved on the parents, and subtasks are then fetched by `parent in (…)`.
 *
 * Parents are not filtered by assignee: someone else may own the parent Task
 * while the subtask is yours.
 */
async function sprintParentKeys(sprintId: number, projectKey: string): Promise<string[]> {
  const issues = await searchJql<JiraIssue>(
    `project = "${escapeJql(projectKey)}" AND sprint = ${sprintId} AND issuetype not in subTaskIssueTypes()`,
    ['summary'],
    { limit: 300 },
  )
  return issues.map((i) => i.key)
}

/**
 * The board shows subtasks assigned to the current user — nothing cleverer.
 * Narrowing is the filters' job, and picking up someone else's work belongs to
 * the search screen instead.
 */
export async function getBoard(query: BoardQuery = {}): Promise<BoardParent[]> {
  const meta = await getProjectMeta()
  const projectKey = requireProjectKey()

  const base = [
    `project = "${escapeJql(projectKey)}"`,
    'assignee = currentUser()',
    'issuetype in subTaskIssueTypes()',
  ]

  if (query.status !== 'all') base.push('statusCategory != Done')
  if (query.search?.trim()) {
    const term = escapeJql(query.search.trim())
    base.push(`(summary ~ "${term}*" OR key = "${term}")`)
  }

  const fields = ['summary', 'status', 'parent', 'issuetype', 'timespent']
  if (meta.storyPointsFieldId) fields.push(meta.storyPointsFieldId)

  let issues: JiraIssue[]

  if (query.sprintId) {
    const parentKeys = await sprintParentKeys(query.sprintId, projectKey)
    if (!parentKeys.length) return []

    // `parent in (…)` with hundreds of keys makes an unwieldy query, so chunk it.
    const CHUNK = 50
    const batches: Promise<JiraIssue[]>[] = []
    for (let i = 0; i < parentKeys.length; i += CHUNK) {
      const chunk = parentKeys.slice(i, i + CHUNK).map((k) => `"${k}"`).join(',')
      batches.push(
        searchJql<JiraIssue>(
          `${[...base, `parent in (${chunk})`].join(' AND ')} ORDER BY created DESC`,
          fields,
          { limit: 200 },
        ),
      )
    }
    issues = (await Promise.all(batches)).flat()
  } else {
    issues = await searchJql<JiraIssue>(
      `${base.join(' AND ')} ORDER BY created DESC`,
      fields,
      { limit: 200 },
    )
  }

  const subtasks: BoardSubtask[] = issues.map((issue) => ({
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary ?? '',
    statusId: issue.fields.status?.id ?? '',
    statusName: issue.fields.status?.name ?? '',
    parentKey: issue.fields.parent?.key ?? null,
    storyPoints: meta.storyPointsFieldId ? num(issue.fields[meta.storyPointsFieldId]) : null,
    timeSpentSeconds: issue.fields.timespent ?? 0,
    loggedTodaySeconds: 0,
  }))

  return groupByParent(subtasks, issues, meta.storyPointsFieldId)
}

async function groupByParent(
  subtasks: BoardSubtask[],
  issues: JiraIssue[],
  storyPointsFieldId: string | null,
): Promise<BoardParent[]> {
  const parentInfo = new Map<
    string,
    {
      summary: string
      issueTypeName: string
      statusName: string
      epicKey: string | null
      epicName: string | null
    }
  >()
  for (const issue of issues) {
    const p = issue.fields.parent
    if (p?.key && !parentInfo.has(p.key)) {
      parentInfo.set(p.key, {
        summary: p.fields?.summary ?? '',
        issueTypeName: p.fields?.issuetype?.name ?? 'Task',
        statusName: '',
        epicKey: null,
        epicName: null,
      })
    }
  }

  // A parent's own story points do not come back on the child's `parent` object,
  // so fetch the parents directly. Without this the rollup mismatch — the whole
  // point of showing the parent row — cannot be computed.
  const parentPoints = new Map<string, number | null>()
  const keys = [...parentInfo.keys()]
  if (keys.length && storyPointsFieldId) {
    const fetched = await searchJql<JiraIssue>(
      `key in (${keys.map((k) => `"${k}"`).join(',')})`,
      ['summary', 'issuetype', 'parent', 'status', storyPointsFieldId],
      { limit: keys.length },
    )
    for (const p of fetched) {
      parentPoints.set(p.key, num(p.fields[storyPointsFieldId]))
      parentInfo.set(p.key, {
        summary: p.fields.summary ?? parentInfo.get(p.key)?.summary ?? '',
        issueTypeName: p.fields.issuetype?.name ?? 'Task',
        statusName: p.fields.status?.name ?? '',
        epicKey: p.fields.parent?.key ?? null,
        epicName: p.fields.parent?.fields?.summary ?? null,
      })
    }
  }

  const groups = new Map<string, BoardParent>()
  const ORPHAN = '__orphan__'

  for (const st of subtasks) {
    const key = st.parentKey ?? ORPHAN
    if (!groups.has(key)) {
      const info = parentInfo.get(key)
      groups.set(key, {
        key,
        summary: info?.summary ?? (key === ORPHAN ? 'Không có task cha' : key),
        issueTypeName: info?.issueTypeName ?? 'Task',
        statusName: info?.statusName ?? '',
        epicKey: info?.epicKey ?? null,
        epicName: info?.epicName ?? null,
        storyPoints: parentPoints.get(key) ?? null,
        childPointsTotal: 0,
        subtasks: [],
      })
    }
    const group = groups.get(key)!
    group.subtasks.push(st)
    group.childPointsTotal += st.storyPoints ?? 0
  }

  return [...groups.values()]
}

/**
 * Standard-level issues assigned to the user in a sprint, with how many subtasks
 * each already has.
 *
 * Work is only ever logged against subtasks, so a sprint holding nothing but
 * bare Tasks leaves the board empty with no way forward. Surfacing those Tasks
 * turns the dead end into an obvious next step: create a subtask under one.
 */
export async function getSprintTasks(
  sprintId: number | null,
  status: 'open' | 'all' = 'all',
): Promise<SprintTask[]> {
  const meta = await getProjectMeta()
  const projectKey = requireProjectKey()

  const clauses = [
    `project = "${escapeJql(projectKey)}"`,
    'assignee = currentUser()',
    'issuetype not in subTaskIssueTypes()',
  ]
  // Done issues still matter here: QC files Bug and Improve already closed, and
  // the work on them may not be logged yet.
  if (status === 'open') clauses.push('statusCategory != Done')
  if (sprintId) clauses.push(`sprint = ${sprintId}`)

  const fields = ['summary', 'status', 'issuetype', 'subtasks', 'parent']
  if (meta.storyPointsFieldId) fields.push(meta.storyPointsFieldId)

  const issues = await searchJql<JiraIssue>(
    `${clauses.join(' AND ')} ORDER BY created DESC`,
    fields,
    { limit: 50 },
  )

  return issues
    .filter((i) => (i.fields.issuetype?.hierarchyLevel ?? 0) === 0)
    .map((issue) => ({
      key: issue.key,
      summary: issue.fields.summary ?? '',
      statusName: issue.fields.status?.name ?? '',
      issueTypeName: issue.fields.issuetype?.name ?? 'Task',
      storyPoints: meta.storyPointsFieldId ? num(issue.fields[meta.storyPointsFieldId]) : null,
      subtaskCount: Array.isArray(issue.fields.subtasks) ? issue.fields.subtasks.length : 0,
      // On a standard-level issue, `parent` points one level up — at the Epic.
      epicKey: issue.fields.parent?.key ?? null,
      epicName: issue.fields.parent?.fields?.summary ?? null,
    }))
}

export async function getTransitions(issueKey: string): Promise<Transition[]> {
  const res = await jiraFetch<{
    transitions?: Array<{ id: string; name: string; to?: { id: string; name: string } }>
  }>(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`)

  // `to.id` is the resulting STATUS id, which is not the transition id — the two
  // are unrelated numbers, and Jira's own transition names can be misleading.
  return (res.transitions ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    toStatusId: t.to?.id ?? '',
    toStatusName: t.to?.name ?? t.name,
  }))
}

/**
 * Sets the story point estimate on an issue.
 *
 * Used mainly on parent tasks: the team enters a parent's points by hand as the
 * sum of its children, so the two drift apart constantly and fixing it should
 * not require a trip to Jira. Field id comes from createmeta — it differs per
 * instance.
 */
export async function updateStoryPoints(issueKey: string, points: number | null): Promise<void> {
  const meta = await getProjectMeta()
  if (!meta.storyPointsFieldId) throw new Error('Không tìm thấy field story point')

  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}`, {
    method: 'PUT',
    body: { fields: { [meta.storyPointsFieldId]: points } },
  })
}

export async function transitionIssue(issueKey: string, transitionId: string): Promise<void> {
  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, {
    method: 'POST',
    body: { transition: { id: transitionId } },
  })
}

