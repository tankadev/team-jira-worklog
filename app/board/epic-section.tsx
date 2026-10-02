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
export function groupByEpic(parents: BoardParent[], newestFirst = true): EpicGroup[] {
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

  // Order epics by the created date of their leading task, matching the chosen
  // direction — newest-first ranks by the newest task, oldest-first by the
  // oldest — so the sort reads consistently at every level. `parents` arrives
  // pre-sorted, so its first entry is that leading task. The catch-all bucket
  // ("not in any epic") always sinks to the bottom.
  return [...groups.values()].sort((a, b) => {
    if (!a.key) return 1
    if (!b.key) return -1
    const at = a.parents[0]?.created ?? 0
    const bt = b.parents[0]?.created ?? 0
    return newestFirst ? bt - at : at - bt
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
  // Full child counts and logged time — not the filtered `subtasks` — so hiding
  // Done subtasks doesn't shrink the epic's totals.
  const subtaskCount = group.parents.reduce((n, p) => n + p.childCount, 0)
  const logged = group.parents.reduce((n, p) => n + p.childTimeSpentTotal, 0)

  const isEpic = Boolean(group.key)

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span
        className={
          'grid size-8 shrink-0 place-items-center rounded-lg ' +
          (isEpic ? 'bg-epic text-white shadow-card' : 'border border-dashed border-line-strong text-ink-3')
        }
      >
        {/* Jira ships this icon in its own colour — `brightness-0 invert`
            flattens any SVG to pure white on the purple tile. */}
        <TypeIcon name="Epic" className={'size-4 ' + (isEpic ? 'brightness-0 invert' : 'opacity-50 grayscale')} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-caption">
          <span className={'font-semibold ' + (isEpic ? 'text-epic-ink' : 'text-ink-3')}>Epic</span>
          {group.key && <span className="whitespace-nowrap font-mono font-semibold text-epic-ink">{group.key}</span>}
          <span className="whitespace-nowrap font-mono text-ink-3">
            · {taskCount} task cha · {subtaskCount} task con
            {logged > 0 && <> · {formatDuration(logged)}</>}
          </span>
        </div>
        <div className="truncate text-emph font-semibold leading-snug text-ink" title={group.name}>
          {group.name}
        </div>
      </div>

      {group.key && (
        <CreateIssueButton
          parentKey={group.key}
          mode="task"
          boardSprintId={boardSprintId}
          className="shrink-0 rounded-lg border border-epic/50 bg-surface px-2.5 py-1 text-caption font-semibold text-epic-ink hover:border-epic hover:bg-epic-soft"
        >
          + Task cha
        </CreateIssueButton>
      )}
    </div>
  )
}
