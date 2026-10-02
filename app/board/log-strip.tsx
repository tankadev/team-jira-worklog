'use client'

import { useState } from 'react'

import type { DayOffKind } from '@/lib/quota'
import {
  DEFAULT_SCHEDULE,
  type WorkSchedule,
  formatClock,
  formatDuration,
  formatSlices,
  placeWorklog,
  sliceWorklog,
} from '@/lib/time'

/**
 * The strip that opens under a row when `+ Log` is pressed.
 *
 * One click on an amount logs it. The amount is the whole decision, so a second
 * confirm would only slow the common case — the undo the caller shows afterwards
 * covers the wrong click. A typed amount and a note sit beside the chips for the
 * rest.
 *
 * Shared by a subtask row and by a parent that has no subtask yet, where the
 * same click first creates one — the caller decides what `onLog` does.
 */
export function LogStrip({
  isToday,
  dateLabel,
  presets,
  step,
  dayLoggedMinutes = 0,
  dayQuotaHours = 0,
  schedule = DEFAULT_SCHEDULE,
  dayOff = null,
  pending,
  onLog,
  intro,
  warning,
}: {
  isToday: boolean
  dateLabel: string
  presets: number[]
  step: number
  /** Logged across the whole day — decides where the entry lands. */
  dayLoggedMinutes?: number
  /** The day's quota, for the "fill the day" amount. 0 on a day off or weekend. */
  dayQuotaHours?: number
  schedule?: WorkSchedule
  dayOff?: DayOffKind | null
  pending: boolean
  onLog: (hours: number, comment: string) => void
  /** A first line above the amounts — e.g. the subtask about to be created. */
  intro?: React.ReactNode
  warning?: React.ReactNode
}) {
  const [custom, setCustom] = useState('')
  const [comment, setComment] = useState('')

  const customHours = Number(custom.replace(',', '.'))
  const customValid = Number.isFinite(customHours) && customHours >= step
  const remainingHours = Math.max(0, dayQuotaHours - dayLoggedMinutes / 60)

  // Where an entry will land, worked out with the same function the server
  // uses. Shown before the click, because "log 6h" reading back as 11:00–18:00
  // is the difference between trusting the timesheet and re-checking it in Jira.
  const start = placeWorklog(dayLoggedMinutes, step * 60, schedule).start
  const slotFor = (h: number) => formatSlices(sliceWorklog(dayLoggedMinutes, h * 60, schedule))

  /**
   * Why the clock reads the way it does. A half day of leave moves the whole
   * working day, and a start time that jumps with no reason given is
   * indistinguishable from a bug.
   */
  const offNote =
    dayOff === 'morning'
      ? `Ngày này nghỉ sáng — buổi làm bắt đầu lúc ${formatClock(schedule.start)}.`
      : dayOff === 'afternoon'
        ? `Ngày này nghỉ chiều — buổi làm kết thúc lúc ${formatClock(schedule.end)}.`
        : ''

  const log = (h: number) => onLog(+h.toFixed(2), comment)
  const tone = isToday
    ? 'bg-accent text-on-accent hover:bg-accent-2'
    : 'bg-ot text-white hover:brightness-110'

  return (
    <div>
      {intro && <div className="mb-2.5">{intro}</div>}

      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-small text-ink-3">
        <span>
          Log vào{' '}
          <b className={'font-semibold ' + (isToday ? 'text-ink' : 'text-ot')}>
            {isToday ? 'hôm nay' : dateLabel}
          </b>
        </span>
        {dayQuotaHours > 0 && (
          <span>
            · ngày còn thiếu{' '}
            <b className={'font-mono font-semibold ' + (remainingHours > 0 ? 'text-warn' : 'text-good')}>
              {remainingHours > 0 ? formatDuration(remainingHours * 3600) : '0h ✓'}
            </b>
          </span>
        )}
        <span title="Worklog xếp nối tiếp trong ngày, nhảy qua giờ nghỉ">
          · bắt đầu từ <b className="font-mono font-medium text-ink-2">{formatClock(start)}</b>
        </span>
        {warning && <span className="text-warn">· {warning}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((h) => {
          const fills = h === remainingHours
          return (
            <button
              key={h}
              type="button"
              disabled={pending}
              onClick={() => log(h)}
              title={`Ghi ${h}h · ${slotFor(h)}${fills ? ' · vừa đủ ngày' : ''}`}
              className={
                'h-8 min-w-[52px] rounded-lg border px-3 font-mono text-small font-semibold shadow-card transition-colors disabled:opacity-50 ' +
                // The amount that completes the day is the likeliest click.
                (fills
                  ? 'border-accent/60 bg-accent-soft text-accent-ink hover:bg-accent hover:text-on-accent'
                  : 'border-line-strong bg-surface text-ink-2 hover:border-accent hover:bg-accent-soft hover:text-accent-ink')
              }
            >
              {h}h
              {fills && <span className="ml-1 font-sans text-caption font-medium">· đủ ngày</span>}
            </button>
          )
        })}
        {remainingHours >= step && !presets.includes(remainingHours) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => log(remainingHours)}
            title={`Ghi nốt ${remainingHours}h cho đủ ngày · ${slotFor(remainingHours)}`}
            className="h-8 rounded-lg border border-accent/60 bg-accent-soft px-3 text-small font-semibold text-accent-ink transition-colors hover:bg-accent hover:text-on-accent disabled:opacity-50"
          >
            Đủ ngày · {formatDuration(remainingHours * 3600)}
          </button>
        )}

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <form
          className="flex min-w-0 flex-1 basis-[280px] items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (customValid) log(customHours)
          }}
        >
          <label className="relative">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              inputMode="decimal"
              placeholder="1.5"
              aria-label="Số giờ khác"
              className="h-8 w-[68px] rounded-lg border border-line-strong bg-surface pl-2.5 pr-6 font-mono text-small"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-caption text-ink-3">
              h
            </span>
          </label>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Ghi chú (không bắt buộc)…"
            aria-label="Ghi chú worklog"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 text-small"
          />
          <button
            type="submit"
            disabled={!customValid || pending}
            title={customValid ? `Ghi ${customHours}h · ${slotFor(customHours)}` : `Nhập số giờ, tối thiểu ${step}h`}
            className={'h-8 shrink-0 rounded-lg px-3 text-small font-semibold shadow-card disabled:opacity-40 ' + tone}
          >
            Log{customValid ? ` ${customHours}h` : ''}
          </button>
        </form>
      </div>
      {offNote && <p className="mt-2 text-caption text-ink-3">{offNote}</p>}
    </div>
  )
}
