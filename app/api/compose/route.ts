import { getIssueDetail } from '@/lib/jira/issues'
import { getProjectMeta } from '@/lib/jira/meta'
import { getSprints } from '@/lib/jira/sprints'
import { listPrefixes } from '@/lib/drafts'
import { SETTING_KEYS, getSetting } from '@/lib/settings'
import { listTaskTemplates } from '@/lib/task-templates'

export const runtime = 'nodejs'

/**
 * Everything the create-subtask modal needs, in one call when it opens.
 *
 * Not sent with the board: prefixes, templates and point budgets are only
 * needed once someone decides to create something, and shipping them with every
 * row would bloat a payload that is already carrying the whole sprint.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const parent = url.searchParams.get('parent')
  // 'subtask' hangs off a Task; 'task' hangs off an Epic. Same `parent` field
  // either way — the issue type is what decides which level it means.
  const mode = url.searchParams.get('mode') === 'task' ? 'task' : 'subtask'
  if (!parent) return Response.json({ error: 'Thiếu tham số parent' }, { status: 400 })

  try {
    const [meta, { sprints, current }, detail] = await Promise.all([
      getProjectMeta(),
      getSprints(),
      getIssueDetail(parent),
    ])

    const type =
      mode === 'task'
        ? (meta.issueTypes.find((t) => t.name === 'Task') ??
           meta.issueTypes.find((t) => !t.subtask && t.hierarchyLevel === 0))
        : meta.issueTypes.find((t) => t.subtask)

    const pattern = getSetting(SETTING_KEYS.sprintPrefixPattern) ?? '[spt {n}]'

    return Response.json({
      mode,
      issueTypeId: type?.id ?? null,
      issueTypeName: type?.name ?? null,
      // Only a standard-level issue carries its own sprint.
      sprints:
        mode === 'task'
          ? sprints.map((s) => ({ id: s.id, name: s.name, current: Boolean(s.current) }))
          : [],
      currentSprintId: current?.id ?? null,
      prefixes: listPrefixes(),
      // The raw pattern, not a finished prefix: the client knows which sprint the
      // issue will land in — the parent's for a subtask, the chosen one for a
      // task — and that is rarely the sprint merely running today.
      sprintPrefixPattern: pattern,
      budgets: {
        1: getSetting(SETTING_KEYS.pointBudget1) ?? '1-2h',
        2: getSetting(SETTING_KEYS.pointBudget2) ?? '4h',
        3: getSetting(SETTING_KEYS.pointBudget3) ?? '1d-2d',
      },
      templates: listTaskTemplates().map((t) => ({
        id: t.id,
        name: t.name,
        title: t.title,
        description: t.description,
        dod: t.dod,
        prefixes: safeParse(t.prefixes),
        storyPoints: t.storyPoints,
        useCount: t.useCount,
      })),
      parent: {
        key: detail.key,
        summary: detail.summary,
        typeName: detail.issueTypeName,
        epicKey: detail.parentKey,
        epicSummary: detail.parentSummary,
        sprintName: detail.sprintName,
      },
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không tải được dữ liệu' },
      { status: 500 },
    )
  }
}

function safeParse(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}
