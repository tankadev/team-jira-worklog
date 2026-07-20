'use client'

import { useState, useTransition } from 'react'

import { logWorkAction } from '@/app/actions'
// Import from types.ts, never issues.ts — the latter pulls in the DB layer and
// would end up in the browser bundle.
import type { BoardSubtask } from '@/lib/jira/types'
import { formatDuration } from '@/lib/time'

import { Spinner } from '../spinner'
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
}: {
  subtask: BoardSubtask
  date: string
  dateLabel: string
  isToday: boolean
  step: number
  presets: number[]
  budgets: Record<number, string>
}) {
  const [hours, setHours] = useState(step)
  const [comment, setComment] = useState('')
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
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

  return (
    <div className="border-b border-line last:border-b-0 hover:bg-surface-2/60">
      <div className="grid h-[42px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 px-3">
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <TypeIcon name="Subtask" className="size-3" />
          <span className="font-mono text-[11.5px] font-semibold text-accent-ink">
            {subtask.key}
          </span>
        </span>

        {/* Truncated to keep the row one line; the full text is in the tooltip. */}
        <span className="truncate text-[13px]" title={subtask.summary}>
          {subtask.summary}
        </span>

        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <StatusPill issueKey={subtask.key} statusName={subtask.statusName} compact />

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

          <NoteButton value={comment} onChange={setComment} issueKey={subtask.key} />

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            title={`Ghi ${hours}h vào ${dateLabel}`}
            className={
              'h-[26px] rounded-md px-2.5 text-[12px] font-medium text-white disabled:opacity-60 ' +
              (isToday ? 'bg-accent hover:bg-accent-2' : 'bg-ot hover:brightness-110')
            }
          >
            {pending ? <Spinner className="size-3 border-white/40 border-t-white" /> : 'Log'}
          </button>
        </span>
      </div>

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
