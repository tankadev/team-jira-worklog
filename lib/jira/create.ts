import 'server-only'

import { SETTING_KEYS, getSetting, requireProjectKey } from '../settings'
import { type JiraIssue, jiraFetch, searchJql } from './client'
import { getProjectMeta } from './meta'

/** Markdown-ish bullet text → ADF. Only bullets and paragraphs, nothing more. */
function toAdf(description: string, dod: string) {
  const content: unknown[] = []

  const pushBlock = (text: string) => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
    let bullets: string[] = []

    const flush = () => {
      if (!bullets.length) return
      content.push({
        type: 'bulletList',
        content: bullets.map((b) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: b }] }],
        })),
      })
      bullets = []
    }

    for (const line of lines) {
      if (/^[-*•]\s+/.test(line)) bullets.push(line.replace(/^[-*•]\s+/, ''))
      else {
        flush()
        content.push({ type: 'paragraph', content: [{ type: 'text', text: line }] })
      }
    }
    flush()
  }

  if (description.trim()) pushBlock(description)

  if (dod.trim()) {
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Definition of Done' }],
    })
    pushBlock(dod)
  }

  if (!content.length) content.push({ type: 'paragraph', content: [] })

  return { type: 'doc', version: 1, content }
}

export interface CreateIssueInput {
  issueTypeId: string
  summary: string
  description: string
  dod: string
  /** Required for a subtask; on a standard issue this is the epic. */
  parentKey?: string | null
  sprintId?: number | null
  storyPoints?: number | null
  assignToMe?: boolean
}

export interface CreatedIssue {
  id: string
  key: string
  url: string
}

/**
 * Creates an issue.
 *
 * `parent` is polymorphic in this hierarchy: on a Task it points at the Epic,
 * on a Subtask it points at the Task. Both are the same field — what it means
 * is decided by the issue type sent alongside it.
 *
 * Field ids come from createmeta and are never hardcoded; they differ per
 * instance and per project style.
 */
export async function createIssue(input: CreateIssueInput): Promise<CreatedIssue> {
  const meta = await getProjectMeta()
  const projectKey = requireProjectKey()
  const baseUrl = getSetting(SETTING_KEYS.jiraBaseUrl)?.replace(/\/+$/, '') ?? ''

  const type = meta.issueTypes.find((t) => t.id === input.issueTypeId)
  if (!type) throw new Error('Issue type không hợp lệ')
  if (type.subtask && !input.parentKey) throw new Error('Subtask bắt buộc phải có task cha')

  const fields: Record<string, unknown> = {
    project: { key: projectKey },
    issuetype: { id: input.issueTypeId },
    summary: input.summary,
    description: toAdf(input.description, input.dod),
  }

  if (input.parentKey) fields.parent = { key: input.parentKey }

  // Never send a sprint on a subtask. Reading one back makes it look settable —
  // a subtask does carry its parent's sprint — but writing it is rejected:
  // "subtasks cannot be associated to a sprint. It's associated to the same
  // sprint as its parent." Enforced here rather than in the UI so no caller can
  // reintroduce it.
  if (input.sprintId && meta.sprintFieldId && !type.subtask) {
    // Bare integer, not an array — the write shape differs from the read shape.
    fields[meta.sprintFieldId] = input.sprintId
  }

  if (input.storyPoints != null && meta.storyPointsFieldId) {
    fields[meta.storyPointsFieldId] = input.storyPoints
  }

  if (input.assignToMe) {
    const me = await jiraFetch<{ accountId: string }>('/rest/api/3/myself')
    fields.assignee = { id: me.accountId }
  }

  const created = await jiraFetch<{ id: string; key: string }>('/rest/api/3/issue', {
    method: 'POST',
    body: { fields },
  })

  return { id: created.id, key: created.key, url: `${baseUrl}/browse/${created.key}` }
}

export interface ParentOption {
  key: string
  summary: string
  epicName: string | null
  sprintId: number | null
  sprintName: string | null
  inCurrentSprint: boolean
}

/** Candidate parents for a subtask: standard-level issues, not Done. */
export async function listParentCandidates(currentSprintId: number | null): Promise<ParentOption[]> {
  const meta = await getProjectMeta()
  const projectKey = requireProjectKey()

  const fields = ['summary', 'issuetype', 'parent', 'status']
  if (meta.sprintFieldId) fields.push(meta.sprintFieldId)

  const issues = await searchJql<JiraIssue>(
    `project = "${projectKey}" AND issuetype not in subTaskIssueTypes() AND statusCategory != Done ORDER BY created DESC`,
    fields,
    { limit: 150 },
  )

  return issues
    .filter((i) => (i.fields.issuetype?.hierarchyLevel ?? 0) === 0)
    .map((issue) => {
      const raw = meta.sprintFieldId ? issue.fields[meta.sprintFieldId] : null
      const sprints = Array.isArray(raw) ? (raw as Array<{ id?: number; name?: string }>) : []
      const last = sprints[sprints.length - 1]
      return {
        key: issue.key,
        summary: issue.fields.summary ?? '',
        // A Task's parent IS its epic — same field, one level up.
        epicName: issue.fields.parent?.fields?.summary ?? null,
        sprintId: last?.id ?? null,
        sprintName: last?.name ?? null,
        inCurrentSprint: Boolean(currentSprintId && last?.id === currentSprintId),
      }
    })
}
