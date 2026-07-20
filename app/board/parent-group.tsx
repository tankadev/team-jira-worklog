import type { BoardParent } from '@/lib/jira/types'
import { SETTING_KEYS, getSetting } from '@/lib/settings'
import { formatDuration } from '@/lib/time'

import { CreateIssueButton } from './create-issue'
import { PointsEditor, PointsRollup } from './points-editor'
import { StatusPill } from './status-pill'
import { SubtaskRow } from './subtask-row'
import { TypeIcon } from './type-icon'

/**
 * A parent task and its subtasks.
 *
 * The header is laid out as three lines rather than one: identity and the two
 * controls that act on the parent (status, points) sit on top where they are
 * reachable, the summary gets a full line so long Vietnamese titles do not
 * squeeze the controls, and the rollup sits underneath as supporting detail.
 */
export function ParentGroup({
  group,
  date,
  dateLabel,
  isToday,
}: {
  group: BoardParent
  date: string
  dateLabel: string
  isToday: boolean
}) {
  const step = Number(getSetting(SETTING_KEYS.logStepHours) ?? '0.5') || 0.5
  const presets = (getSetting(SETTING_KEYS.logPresets) ?? '0.5,1,2,4,8')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)

  const budgets: Record<number, string> = {
    1: getSetting(SETTING_KEYS.pointBudget1) ?? '1-2h',
    2: getSetting(SETTING_KEYS.pointBudget2) ?? '4h',
    3: getSetting(SETTING_KEYS.pointBudget3) ?? '1d-2d',
  }

  const isOrphan = group.key === '__orphan__'
  const loggedTotal = group.subtasks.reduce((n, s) => n + s.timeSpentSeconds, 0)

  return (
    <article className="rounded-[9px] border border-line bg-surface">
      <header className="rounded-t-[9px] border-b border-line bg-surface-2 px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {!isOrphan && (
            <>
              {/* Tier marker, matching the Epic badge above it: the three levels
                  should be identifiable without counting indentation. */}
              <span className="rounded-[3px] bg-blue-soft px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-blue">
                Task cha
              </span>
              {/* The Jira issue type is separate — a parent may be a Task, a Bug
                  or an Improve, and which one matters when reading the board. */}
              <span className="inline-flex items-center gap-1 rounded-[3px] border border-line-strong px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-ink-3">
                <TypeIcon name={group.issueTypeName} className="size-3" />
                {group.issueTypeName}
              </span>
            </>
          )}

          <span className="font-mono text-[11.5px] font-semibold text-ink-2">
            {isOrphan ? '—' : group.key}
          </span>

          {!isOrphan && group.statusName && (
            <StatusPill issueKey={group.key} statusName={group.statusName} />
          )}

          <span className="ml-auto flex flex-wrap items-center gap-2">
            {loggedTotal > 0 && (
              <span className="font-mono text-[11px] text-ink-3">
                đã log {formatDuration(loggedTotal)}
              </span>
            )}
            {!isOrphan && (
              <PointsEditor
                issueKey={group.key}
                value={group.storyPoints}
                suggestion={group.childPointsTotal || null}
                variant="parent"
              />
            )}
          </span>
        </div>

        <div className="mt-1.5 text-[13px]">{group.summary}</div>

        {!isOrphan && (
          <div className="mt-1">
            <PointsRollup
              value={group.storyPoints}
              childTotal={group.childPointsTotal}
              childCount={group.subtasks.length}
            />
          </div>
        )}
      </header>

      <div className="flex flex-col">
        {group.subtasks.map((subtask) => (
          <SubtaskRow
            key={subtask.key}
            subtask={subtask}
            date={date}
            dateLabel={dateLabel}
            isToday={isToday}
            step={step}
            presets={presets}
            budgets={budgets}
          />
        ))}

        {/* Sits after the last subtask, where "one more" naturally belongs —
            the header is already carrying status and points. */}
        {!isOrphan && (
          <CreateIssueButton
            parentKey={group.key}
            className="flex w-full items-center gap-1.5 border-t border-line px-3.5 py-2 text-left text-[12px] text-ink-3 hover:bg-surface-2 hover:text-accent-ink"
          >
            + Task con cho {group.key}
          </CreateIssueButton>
        )}
      </div>
    </article>
  )
}
