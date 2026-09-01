'use client'

import { useState, useTransition } from 'react'

import { logWorkAction } from '@/app/actions'
// Import from types.ts, never issues.ts — the latter pulls in the DB layer and
// would end up in the browser bundle.
import type { BoardSubtask } from '@/lib/jira/types'
import { issueHygiene } from '@/lib/jira/types'
import { DEFAULT_SCHEDULE, type WorkSchedule, formatClock, formatDuration, placeWorklog } from '@/lib/time'

import { Spinner } from '../spinner'
import { DatesEditor } from './dates-editor'
import { HygieneBadge } from './hygiene-badge'
import { IssueDetail } from './issue-detail'
import { useNav } from './navigation'
import { PointsEditor } from './points-editor'
import { Popover, PopoverTitle } from './popover'
import { StatusPill } from './status-pill'
import { TypeIcon } from './type-icon'

/**
 * One subtask, on a single 42px line.
 *
 * The row previously ran three lines and ~100px, so ten subtasks filled more
 * than a screen. Only what is touched on every log stays inline — the hour
 * stepper and the Log button. Points and the worklog note moved into popovers,
 * and the two hour figures merged into one `today · total` column.
 */
export function SubtaskRow({
  subtask,
  date,
  dateLabel,
  isToday,
  step,
  presets,
  budgets,
  sprintEnd = null,
  team = { label: null, prefix: null },
  datesSupported = true,
  dayLoggedMinutes = 0,
  schedule = DEFAULT_SCHEDULE,
}: {
  subtask: BoardSubtask
  date: string
  dateLabel: string
  isToday: boolean
  step: number
  presets: number[]
  budgets: Record<number, string>
  /** End of the sprint on screen, offered as a one-click due date. */
  sprintEnd?: string | null
  /** The team's filing rules, for the warning badge. */
  team?: { label: string | null; prefix: string | null }
  /** False on a project with neither date field — hides the chip entirely. */
  datesSupported?: boolean
  /** Logged across the whole day, which is what decides where this entry lands. */
  dayLoggedMinutes?: number
  schedule?: WorkSchedule
}) {
  const [hours, setHours] = useState(step)
  const [comment, setComment] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const { refresh } = useNav()

  function submit() {
    startTransition(async () => {
      const res = await logWorkAction({ issueKey: subtask.key, hours, date, comment })
      setResult(res)
      if (res.ok) {
        setComment('')
        refresh()
      }
    })
  }

  const today = subtask.loggedTodaySeconds
  const total = subtask.timeSpentSeconds
  const hygiene = issueHygiene(subtask, team)

  // Where this entry will land, worked out with the same function the server
  // uses. Shown before the click, because "log 6h" reading back as 11:00–18:00
  // is the difference between trusting the timesheet and re-checking it in Jira.
  const slot = placeWorklog(dayLoggedMinutes, hours * 60, schedule)
  const slotLabel = `${formatClock(slot.start)}–${formatClock(slot.end)}`

  return (
    <div className="border-b border-line last:border-b-0 hover:bg-surface-2/60">
      {/* Height follows the title rather than fixing it: the row carries eight
          controls now, so a single truncated line left most summaries unreadable
          — and the summary is what you actually pick a task by. */}
      <div className="grid min-h-[42px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          title={`Xem chi tiết ${subtask.key}`}
          className="flex items-center gap-1.5 whitespace-nowrap rounded px-0.5 hover:bg-accent-soft"
        >
          <TypeIcon name="Subtask" className="size-3" />
          <span className="font-mono text-[11.5px] font-semibold text-accent-ink underline-offset-2 hover:underline">
            {subtask.key}
          </span>
        </button>

        {/* Two lines, then ellipsis. Anything longer is still in the tooltip and
            in the detail panel; three lines would push the controls apart enough
            to lose the scannable grid. */}
        <span className="flex min-w-0 items-start gap-1.5">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            title={subtask.summary}
            className="line-clamp-2 min-w-0 text-left text-[13px] leading-[1.35] hover:text-accent-ink"
          >
            {subtask.summary}
          </button>
          {(hygiene.missingLabel || hygiene.missingPrefix) && (
            <span className="shrink-0 pt-px">
              <HygieneBadge hygiene={hygiene} />
            </span>
          )}
        </span>

        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <StatusPill issueKey={subtask.key} statusName={subtask.statusName} compact />

          {datesSupported && (
          <DatesEditor
            issueKey={subtask.key}
            startDate={subtask.startDate}
            dueDate={subtask.dueDate}
            sprintEnd={sprintEnd}
            isDone={subtask.statusName.trim().toUpperCase() === 'DONE'}
          />
          )}

          <PointsEditor
            issueKey={subtask.key}
            value={subtask.storyPoints}
            budgets={budgets}
            spentSeconds={total}
          />

          <span
            className="min-w-[62px] text-right font-mono text-[11px] text-ink-3"
            title={`${isToday ? 'Hôm nay' : dateLabel}: ${formatDuration(today)} · tổng: ${formatDuration(total)}`}
          >
            <span className={today > 0 ? 'font-semibold text-accent-ink' : ''}>
              {today > 0 ? formatDuration(today) : '—'}
            </span>
            <span className="opacity-60"> · </span>
            {total > 0 ? formatDuration(total) : '—'}
          </span>

          <HourStepper
            hours={hours}
            step={step}
            presets={presets}
            onChange={setHours}
          />

          {/* Directly after the stepper that determines it: the slot is the one
              thing about a log that used to be invisible and wrong at the same
              time, and seeing it move as the hours change is the explanation. */}
          <span
            className="min-w-[76px] text-right font-mono text-[10.5px] tabular text-ink-3"
            title={`Worklog sẽ bắt đầu lúc ${formatClock(slot.start)} — xếp nối tiếp trong ngày, nhảy qua giờ nghỉ`}
          >
            {slotLabel}
          </span>

          <NoteButton value={comment} onChange={setComment} issueKey={subtask.key} />

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            title={`Ghi ${hours}h vào ${dateLabel}, ${slotLabel}`}
            className={
              'h-[26px] rounded-md px-2.5 text-[12px] font-medium text-white disabled:opacity-60 ' +
              (isToday ? 'bg-accent hover:bg-accent-2' : 'bg-ot hover:brightness-110')
            }
          >
            {pending ? <Spinner className="size-3 border-white/40 border-t-white" /> : 'Log'}
          </button>

        </span>
      </div>

      {detailOpen && (
        <IssueDetail issueKey={subtask.key} onClose={() => setDetailOpen(false)} />
      )}

      {result && (
        <p
          className={
            'px-3 pb-1.5 text-[11.5px] ' + (result.ok ? 'text-good' : 'text-crit')
          }
        >
          {result.message}
        </p>
      )}
    </div>
  )
}

function HourStepper({
  hours,
  step,
  presets,
  onChange,
}: {
  hours: number
  step: number
  presets: number[]
  onChange: (h: number) => void
}) {
  return (
    <span className="flex h-[26px] items-center rounded-md border border-line-strong bg-surface">
      <button
        type="button"
        onClick={() => onChange(Math.max(step, +(hours - step).toFixed(2)))}
        className="h-full w-[22px] rounded-l-[5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        aria-label="Giảm"
      >
        −
      </button>

      <Popover
        align="right"
        panelClassName="w-[92px] p-1"
        trigger={() => (
          <button
            type="button"
            className="flex h-[26px] w-[48px] items-center justify-center gap-0.5 border-x border-line font-mono text-[12px] hover:bg-surface-2"
          >
            {hours}h <em className="text-[8px] not-italic text-ink-3">▾</em>
          </button>
        )}
      >
        {(close) => (
          <>
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p)
                  close()
                }}
                className="block w-full rounded px-2 py-[5px] text-left font-mono text-[12.5px] hover:bg-accent-soft hover:text-accent-ink"
              >
                {p}h
              </button>
            ))}
          </>
        )}
      </Popover>

      <button
        type="button"
        onClick={() => onChange(+(hours + step).toFixed(2))}
        className="h-full w-[22px] rounded-r-[5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        aria-label="Tăng"
      >
        +
      </button>
    </span>
  )
}

/** Worklog note. Behind a button because most logs do not carry one. */
function NoteButton({
  value,
  onChange,
  issueKey,
}: {
  value: string
  onChange: (v: string) => void
  issueKey: string
}) {
  return (
    <Popover
      align="right"
      panelClassName="w-[248px]"
      trigger={() => (
        <button
          type="button"
          title={value ? `Ghi chú: ${value}` : 'Thêm ghi chú cho lần log này'}
          className={
            'grid h-[26px] w-[26px] place-items-center rounded-md border text-[12px] ' +
            (value
              ? 'border-accent bg-accent-soft text-accent-ink'
              : 'border-line-strong bg-surface text-ink-3 hover:border-accent hover:text-accent-ink')
          }
        >
          ✎
        </button>
      )}
    >
      {(close) => (
        <>
          <PopoverTitle>{issueKey} · ghi chú worklog</PopoverTitle>
          <textarea
            rows={3}
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) close()
            }}
            placeholder="Không bắt buộc…"
            className="w-full resize-y rounded-md border border-line bg-ground px-2 py-1.5 text-[12.5px] leading-relaxed"
          />
          <p className="mt-1.5 text-[11px] text-ink-3">Đi kèm lần bấm Log tiếp theo.</p>
        </>
      )}
    </Popover>
  )
}
