'use client'

import { useState, useTransition } from 'react'

import { logWorkAction } from '@/app/actions'
// Import from types.ts, never issues.ts — the latter pulls in the DB layer and
// would end up in the browser bundle.
import type { BoardSubtask } from '@/lib/jira/types'
import { formatDuration } from '@/lib/time'

import { PointsEditor } from './points-editor'
import { StatusPill } from './status-pill'

/**
 * One subtask: the only place hours can actually be logged.
 *
 * Laid out as two columns — everything descriptive on the left, everything
 * clickable on the right — so the Log button lands in the same spot on every
 * row no matter how long the Vietnamese summary runs.
 */
export function SubtaskRow({
  subtask,
  date,
  dateLabel,
  isToday,
  step,
  presets,
  budget,
}: {
  subtask: BoardSubtask
  date: string
  dateLabel: string
  isToday: boolean
  step: number
  presets: number[]
  budget: { min: number; max: number } | null
}) {
  const [hours, setHours] = useState(step)
  const [comment, setComment] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const spent = subtask.timeSpentSeconds
  const overBudget = budget ? spent / 3600 > budget.max : false
  const budgetLabel = budget
    ? budget.min === budget.max
      ? `${budget.max}h`
      : `${budget.min}–${budget.max}h`
    : null

  function submit() {
    startTransition(async () => {
      const res = await logWorkAction({ issueKey: subtask.key, hours, date, comment })
      setResult(res)
      if (res.ok) setComment('')
    })
  }

  return (
    <div className="border-b border-line px-3.5 py-3 last:border-b-0 hover:bg-surface-2/60">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        {/* ── description ── */}
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {/* Third tier marker. Epic and Task cha carry one too, so the level
                is readable on its own row without tracing the nesting. */}
            <span className="rounded-[3px] bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Sub task
            </span>
            <span className="font-mono text-[11.5px] font-semibold text-accent-ink">
              {subtask.key}
            </span>
            <StatusPill issueKey={subtask.key} statusName={subtask.statusName} />
            {subtask.loggedTodaySeconds > 0 && (
              <span className="rounded-[3px] bg-accent-soft px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent-ink">
                {isToday ? 'hôm nay' : 'ngày này'} {formatDuration(subtask.loggedTodaySeconds)}
              </span>
            )}
          </div>

          <div className="mb-1.5 text-[13.5px] leading-snug">{subtask.summary}</div>

          <div className="flex flex-wrap items-center gap-2">
            <PointsEditor issueKey={subtask.key} value={subtask.storyPoints} max={3} />

            <span
              className={
                'rounded px-[7px] py-[3px] font-mono text-[11px] ' +
                (overBudget ? 'bg-crit-soft text-crit' : 'bg-surface-2 text-ink-3')
              }
              title={
                overBudget ? 'Đã log quá ước lượng — chỉ cảnh báo, không chặn' : 'Tổng giờ đã log'
              }
            >
              {formatDuration(spent)}
              {budgetLabel && <span className="opacity-70"> / {budgetLabel}</span>}
            </span>
          </div>
        </div>

        {/* ── actions ── */}
        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          <div className="relative flex items-center rounded-md border border-line-strong bg-surface">
            <button
              type="button"
              onClick={() => setHours((h) => Math.max(step, +(h - step).toFixed(2)))}
              className="h-7 w-6 rounded-l-[5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
              aria-label="Giảm"
            >
              −
            </button>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-7 w-14 items-center justify-center gap-[3px] border-x border-line font-mono text-[12.5px] hover:bg-surface-2"
            >
              {hours}h <em className="text-[8px] not-italic text-ink-3">▾</em>
            </button>

            {menuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Đóng"
                />
                <div className="absolute left-6 top-8 z-40 flex min-w-[92px] flex-col rounded-md border border-line-strong bg-surface p-1 shadow-lg">
                  {presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        setHours(p)
                        setMenuOpen(false)
                      }}
                      className="rounded px-[9px] py-[5px] text-left font-mono text-[12.5px] hover:bg-accent-soft hover:text-accent-ink"
                    >
                      {p}h
                    </button>
                  ))}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setHours((h) => +(h + step).toFixed(2))}
              className="h-7 w-6 rounded-r-[5px] text-ink-2 hover:bg-surface-2 hover:text-ink"
              aria-label="Tăng"
            >
              +
            </button>
          </div>

          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ghi chú…"
            className="h-7 w-[150px] rounded-md border border-line bg-surface px-[9px] text-[12.5px]"
          />

          <button
            type="button"
            onClick={submit}
            disabled={pending}
            title={`Ghi ${hours}h vào ${dateLabel}`}
            className={
              'h-7 rounded-md px-3 text-[12.5px] font-medium text-white disabled:opacity-60 ' +
              (isToday ? 'bg-accent hover:bg-accent-2' : 'bg-ot hover:brightness-110')
            }
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" />
                Đang log…
              </span>
            ) : isToday ? (
              'Log'
            ) : (
              `Log ${dateLabel.split(' · ')[1] ?? dateLabel}`
            )}
          </button>
        </div>
      </div>

      {result && (
        <p className={'mt-2 text-[11.5px] ' + (result.ok ? 'text-good' : 'text-crit')}>
          {result.message}
        </p>
      )}
    </div>
  )
}
