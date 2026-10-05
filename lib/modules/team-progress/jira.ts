import 'server-only'

import { type JiraIssue, searchJql } from '@/lib/jira/client'
import { getProjectMeta } from '@/lib/jira/meta'
import { getTeamScope, requireProjectKey } from '@/lib/settings'

import type { ProgressEpic, ProgressIssue } from './model'

export interface ProgressData {
  epics: ProgressEpic[]
  issues: ProgressIssue[]
  /** Subtask key → parent key, so a PR naming a subtask finds its epic. */
  subtaskParent: Record<string, string>
}

function escapeJql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

const quoted = (keys: string[]) => keys.map((k) => `"${escapeJql(k)}"`).join(',')

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * The team's work for a sprint, at feature level.
 *
 * An epic is never in a sprint itself — only its tasks are — so the sprint is
 * read first and its epics are found through the tasks' parents. Then *every*
 * child of those epics is read, wherever it sits, because "how far along is
 * this feature" spans sprints: the document finished two sprints ago and the
 * QC tests nobody has scheduled yet are part of the answer. Each issue says
 * whether it is in the sprint, and the page decides which view to show.
 *
 * Team-wide, unlike the rest of the app: this is a lead's view of everyone's
 * work, narrowed by the team label only.
 *
 * Subtask progress comes from the parent's own `subtasks` field, which carries
 * each child's status — one query fewer than fetching the subtasks, at the cost
 * of weighting by count rather than points.
 */
export async function loadProgress(sprintId: number): Promise<ProgressData> {
  const meta = await getProjectMeta()
  const projectKey = requireProjectKey()
  const { label } = getTeamScope()
  const team = label ? [`labels = "${escapeJql(label)}"`] : []

  const fields = ['summary', 'issuetype', 'status', 'parent', 'assignee', 'issuelinks', 'subtasks']
  if (meta.sprintFieldId) fields.push(meta.sprintFieldId)
  if (meta.storyPointsFieldId) fields.push(meta.storyPointsFieldId)

  const standard = 'issuetype not in subTaskIssueTypes()'
  const inSprint = await searchJql<JiraIssue>(
    [`project = "${escapeJql(projectKey)}"`, `sprint = ${sprintId}`, standard, ...team].join(' AND '),
    fields,
    { limit: 600 },
  )

  const epicKeys = [...new Set(inSprint.map((i) => i.fields.parent?.key).filter((k): k is string => Boolean(k)))]

  const [children, epics] = await Promise.all([
    Promise.all(
      chunks(epicKeys, 50).map((c) =>
        searchJql<JiraIssue>([`parent in (${quoted(c)})`, standard, ...team].join(' AND '), fields, { limit: 1000 }),
      ),
    ).then((r) => r.flat()),
    Promise.all(
      chunks(epicKeys, 50).map((c) => searchJql<JiraIssue>(`key in (${quoted(c)})`, ['summary', 'status'], { limit: c.length })),
    ).then((r) => r.flat()),
  ])

  const sprintKeys = new Set(inSprint.map((i) => i.key))
  const byKey = new Map<string, JiraIssue>()
  for (const i of [...inSprint, ...children]) byKey.set(i.key, i)

  const subtaskParent: Record<string, string> = {}
  const issues: ProgressIssue[] = [...byKey.values()].map((i) => {
    const f = i.fields
    const sprints = meta.sprintFieldId && Array.isArray(f[meta.sprintFieldId])
      ? (f[meta.sprintFieldId] as Array<{ id?: number; name?: string }>)
      : []
    const links = Array.isArray(f.issuelinks)
      ? (f.issuelinks as Array<{ type?: { name?: string }; outwardIssue?: { key?: string } }>)
      : []
    const subtasks = Array.isArray(f.subtasks)
      ? (f.subtasks as Array<{ key?: string; fields?: { summary?: string; status?: { name?: string } } }>)
      : []
    for (const s of subtasks) if (s.key) subtaskParent[s.key] = i.key
    const points = meta.storyPointsFieldId ? f[meta.storyPointsFieldId] : null

    return {
      key: i.key,
      summary: f.summary ?? '',
      typeName: f.issuetype?.name ?? 'Task',
      statusName: f.status?.name ?? '',
      assignee: f.assignee?.displayName ?? null,
      storyPoints: typeof points === 'number' ? points : null,
      epicKey: f.parent?.key ?? null,
      inSprint: sprintKeys.has(i.key) || sprints.some((s) => s.id === sprintId),
      sprints: sprints.map((s) => s.name ?? '').filter(Boolean),
      // "X clones Y" is the outward side of Jira's Cloners link.
      clones: links
        .filter((l) => /clon/i.test(l.type?.name ?? '') && l.outwardIssue?.key)
        .map((l) => l.outwardIssue!.key!),
      subtasks: subtasks.map((s) => ({
        key: s.key ?? '',
        statusName: s.fields?.status?.name ?? '',
        summary: s.fields?.summary ?? '',
      })),
    }
  })

  // Newest first, as Jira's own lists read: higher issue numbers are newer.
  const num = (k: string) => Number(k.split('-').pop()) || 0
  issues.sort((a, b) => num(b.key) - num(a.key))

  return {
    epics: epics.map((e) => ({ key: e.key, summary: e.fields.summary ?? e.key, statusName: e.fields.status?.name ?? '' })),
    issues,
    subtaskParent,
  }
}
