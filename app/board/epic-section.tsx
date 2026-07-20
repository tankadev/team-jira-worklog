import type { BoardParent } from '@/lib/jira/types'
import { formatDuration } from '@/lib/time'

import { CreateIssueButton } from './create-issue'
import { TypeIcon } from './type-icon'

export interface EpicGroup {
  key: string | null
  name: string
  parents: BoardParent[]
}

/**
 * Groups parent tasks by the epic above them.
 *
 * Deliberately a header band rather than a third nested card: the row already
 * carries a stepper, a note field and a Log button, and each extra level of
 * boxing eats the width those need. Two levels of card plus a light epic rule
 * reads as three levels without costing horizontal room.
 */
export function groupByEpic(parents: BoardParent[]): EpicGroup[] {
  const groups = new Map<string, EpicGroup>()

  for (const parent of parents) {
    const key = parent.epicKey ?? '__none__'
    if (!groups.has(key)) {
      groups.set(key, {
        key: parent.epicKey,
        name: parent.epicName ?? 'Không thuộc epic nào',
        parents: [],
      })
    }
    groups.get(key)!.parents.push(parent)
  }

  // Largest epics first; the catch-all bucket always sinks to the bottom.
  return [...groups.values()].sort((a, b) => {
    if (!a.key) return 1
    if (!b.key) return -1
    return b.parents.length - a.parents.length
  })
}

export function EpicHeader({
  group,
  boardSprintId,
}: {
  group: EpicGroup
  /** Sprint the board is filtered to, so a new task lands where the user is looking. */
  boardSprintId: number | null
}) {
  const taskCount = group.parents.length
  const subtaskCount = group.parents.reduce((n, p) => n + p.subtasks.length, 0)
  const logged = group.parents.reduce(
    (n, p) => n + p.subtasks.reduce((m, s) => m + s.timeSpentSeconds, 0),
    0,
  )

  return (
    <div className="mb-2 mt-1 flex flex-wrap items-center gap-2 border-l-2 border-epic pl-2.5">
      <span className="inline-flex items-center gap-1 rounded-[3px] bg-epic px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-white">
        {/* The badge is solid purple, and Jira ships this icon in its own colour —
            `brightness-0 invert` flattens any SVG to pure white, which is the only
            way to recolour an <img> the browser treats as opaque. */}
        <TypeIcon name="Epic" className="size-3 brightness-0 invert" />
        Epic
      </span>

      {group.key && (
        <span className="font-mono text-[11.5px] font-semibold text-epic-ink">{group.key}</span>
      )}

      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{group.name}</span>

      <span className="font-mono text-[11px] text-ink-3">
        {taskCount} task · {subtaskCount} task con
        {logged > 0 && <> · {formatDuration(logged)}</>}
      </span>

      {group.key && (
        <CreateIssueButton
          parentKey={group.key}
          mode="task"
          boardSprintId={boardSprintId}
          className="rounded-md border border-epic/50 px-2 py-[2px] font-mono text-[11px] text-epic-ink hover:border-epic hover:bg-epic-soft"
        >
          + Task
        </CreateIssueButton>
      )}
    </div>
  )
}
