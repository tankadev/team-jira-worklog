import type { BoardParent } from '@/lib/jira/types'
import { SETTING_KEYS, getSetting } from '@/lib/settings'
import { formatDuration } from '@/lib/time'

import { PointsEditor } from './points-editor'
import { StatusPill } from './status-pill'
import { SubtaskRow } from './subtask-row'
import { TypeIcon } from './type-icon'

/** "1-2h" → {min:1,max:2}; "4h" → {min:4,max:4}; "1d-2d" → {min:8,max:16}. */
function parseBudget(spec: string, hoursPerDay: number) {
  const part = (s: string) => {
    const m = s.trim().match(/^([\d.]+)\s*([hd])?$/i)
    if (!m) return null
    const n = Number(m[1])
    return m[2]?.toLowerCase() === 'd' ? n * hoursPerDay : n
  }
  const [lo, hi] = spec.split('-')
  const min = part(lo ?? '')
  if (min === null) return null
  const max = hi ? (part(hi) ?? min) : min
  return { min, max }
}

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
  const hoursPerDay = Number(getSetting(SETTING_KEYS.dailyQuotaHours) ?? '8') || 8

  const budgets = new Map<number, { min: number; max: number }>()
  for (const [point, key] of [
    [1, SETTING_KEYS.pointBudget1],
    [2, SETTING_KEYS.pointBudget2],
    [3, SETTING_KEYS.pointBudget3],
  ] as const) {
    const parsed = parseBudget(getSetting(key) ?? '', hoursPerDay)
    if (parsed) budgets.set(point, parsed)
  }

  const isOrphan = group.key === '__orphan__'
  const loggedTotal = group.subtasks.reduce((n, s) => n + s.timeSpentSeconds, 0)
  const matches = group.storyPoints !== null && group.storyPoints === group.childPointsTotal

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
              />
            )}
          </span>
        </div>

        <div className="mt-1.5 text-[13px]">{group.summary}</div>

        {!isOrphan && (
          <div className="mt-1 font-mono text-[11px] text-ink-3">
            {group.subtasks.length} task con · tổng {group.childPointsTotal} SP
            {matches && <span className="text-good"> · khớp ✓</span>}
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
            budget={subtask.storyPoints ? (budgets.get(subtask.storyPoints) ?? null) : null}
          />
        ))}
      </div>
    </article>
  )
}
