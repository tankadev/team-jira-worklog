import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '../db'
import { jqlPresets } from '../db/schema'
import { ensureSeeded, requireProjectKey } from '../settings'
import { type JiraIssue, jiraFetch, searchJql } from './client'
import { getProjectMeta } from './meta'

export interface FoundIssue {
  key: string
  summary: string
  statusName: string
  issueTypeName: string
  isSubtask: boolean
  parentKey: string | null
  storyPoints: number | null
  assigneeName: string | null
  assigneeAccountId: string | null
  sprintName: string | null
}

function escapeJql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null
}

function sprintNameOf(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length) return null
  const last = value[value.length - 1] as { name?: string }
  return last?.name ?? null
}

async function run(jql: string, limit = 60): Promise<FoundIssue[]> {
  const meta = await getProjectMeta()

  const fields = ['summary', 'status', 'issuetype', 'parent', 'assignee']
  if (meta.storyPointsFieldId) fields.push(meta.storyPointsFieldId)
  if (meta.sprintFieldId) fields.push(meta.sprintFieldId)

  const issues = await searchJql<JiraIssue>(jql, fields, { limit })

  return issues.map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary ?? '',
    statusName: issue.fields.status?.name ?? '',
    issueTypeName: issue.fields.issuetype?.name ?? '',
    isSubtask: Boolean(issue.fields.issuetype?.subtask),
    parentKey: issue.fields.parent?.key ?? null,
    storyPoints: meta.storyPointsFieldId ? num(issue.fields[meta.storyPointsFieldId]) : null,
    assigneeName: issue.fields.assignee?.displayName ?? null,
    assigneeAccountId: issue.fields.assignee?.accountId ?? null,
    sprintName: meta.sprintFieldId ? sprintNameOf(issue.fields[meta.sprintFieldId]) : null,
  }))
}

export type OwnerFilter = 'unassigned' | 'others' | 'all'

/**
 * Issues in a sprint. Subtasks are excluded because JQL cannot match them on
 * sprint at all — see the board query for the same limitation.
 */
export async function findInSprint(
  sprintId: number,
  owner: OwnerFilter,
  search: string,
): Promise<FoundIssue[]> {
  const projectKey = requireProjectKey()
  const clauses = [`project = "${escapeJql(projectKey)}"`, `sprint = ${sprintId}`]

  if (owner === 'unassigned') clauses.push('assignee IS EMPTY')
  if (owner === 'others') clauses.push('assignee != currentUser() AND assignee IS NOT EMPTY')
  if (search.trim()) {
    const term = escapeJql(search.trim())
    clauses.push(`(summary ~ "${term}*" OR key = "${term}")`)
  }

  return run(`${clauses.join(' AND ')} ORDER BY created DESC`)
}

export async function findInProject(
  search: string,
  status: 'open' | 'all',
  scope: 'all' | 'backlog',
): Promise<FoundIssue[]> {
  const projectKey = requireProjectKey()
  const clauses = [`project = "${escapeJql(projectKey)}"`]

  if (status === 'open') clauses.push('statusCategory != Done')
  if (scope === 'backlog') clauses.push('sprint IS EMPTY')
  if (search.trim()) {
    const term = escapeJql(search.trim())
    clauses.push(`(summary ~ "${term}*" OR key = "${term}")`)
  }

  return run(`${clauses.join(' AND ')} ORDER BY created DESC`)
}

export async function findByJql(jql: string): Promise<FoundIssue[]> {
  return run(jql)
}

export interface Preset {
  id: number
  name: string
  jql: string
  builtin: boolean
}

/**
 * Presets store `{project}` and `{sp}` rather than literal values: a preset
 * containing a hardcoded `cf[10016]` would work here and silently break on any
 * other project, since that id differs per instance.
 */
export async function listPresets(): Promise<Preset[]> {
  ensureSeeded()
  const meta = await getProjectMeta()
  const projectKey = requireProjectKey()
  const spId = meta.storyPointsFieldId?.replace('customfield_', '') ?? ''

  return db
    .select()
    .from(jqlPresets)
    .all()
    .map((p) => ({
      id: p.id,
      name: p.name,
      builtin: p.builtin,
      jql: p.jql.replace(/\{project\}/g, projectKey).replace(/\{sp\}/g, spId),
    }))
}

export function savePreset(name: string, jql: string) {
  ensureSeeded()
  return db.insert(jqlPresets).values({ name, jql, builtin: false }).returning().get()
}

export function deletePreset(id: number) {
  const row = db.select().from(jqlPresets).where(eq(jqlPresets.id, id)).get()
  if (!row || row.builtin) return
  db.delete(jqlPresets).where(eq(jqlPresets.id, id)).run()
}

/** Assigns an issue to the signed-in user. */
export async function assignToMe(issueKey: string, accountId: string) {
  await jiraFetch(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/assignee`, {
    method: 'PUT',
    body: { accountId },
  })
}
