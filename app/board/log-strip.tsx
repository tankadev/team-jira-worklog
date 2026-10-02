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
 * Choose, then confirm: an amount chip (or a typed amount) only selects; the
 * Log button then reads back exactly what will be written — "Log 2h ·
 * 09:00–11:00" — and nothing reaches Jira until it is pressed. One click that
 * wrote straight away made a mis-tap a worklog to go and delete.
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
  onOpenCalendar,
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
  /** Offers "Chọn ngày khác" — logging on another day from the calendar. */
  onOpenCalendar?: () => void
}) {
  const [custom, setCustom] = useState('')
  const [comment, setComment] = useState('')
  /** The chip chosen; a typed amount takes over from it. */
  const [picked, setPicked] = useState<number | null>(null)

  const customHours = Number(custom.replace(',', '.'))
  const customValid = custom.trim() !== '' && Number.isFinite(customHours) && customHours >= step
  const remainingHours = Math.max(0, dayQuotaHours - dayLoggedMinutes / 60)
  const hours = customValid ? +customHours.toFixed(2) : picked

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

  function choose(h: number) {
    setPicked(+h.toFixed(2))
    setCustom('')
  }
  function confirm() {
    if (hours && !pending) onLog(hours, comment)
  }
  /** A chosen chip: filled in the colour of the button that will log it. */
  const chosen = isToday
    ? 'border-accent bg-accent text-on-accent'
    : 'border-ot bg-ot text-white'
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
        {onOpenCalendar && (
          <button
            type="button"
            onClick={onOpenCalendar}
            className="ml-auto rounded-md px-2 py-0.5 text-caption font-medium text-accent-ink hover:bg-accent-soft"
          >
            📅 Chọn ngày khác
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((h) => {
          const fills = h === remainingHours
          return (
            <button
              key={h}
              type="button"
              disabled={pending}
              onClick={() => choose(h)}
              aria-pressed={hours === h && !customValid}
              title={`Chọn ${h}h · ${slotFor(h)}${fills ? ' · vừa đủ ngày' : ''}`}
              className={
                'h-8 min-w-[52px] rounded-lg border px-3 font-mono text-small font-semibold shadow-card transition-colors disabled:opacity-50 ' +
                (picked === h && !customValid
                  ? chosen
                  : // The amount that completes the day is the likeliest pick.
                    fills
                    ? 'border-accent/60 bg-accent-soft text-accent-ink hover:border-accent'
                    : 'border-line-strong bg-surface text-ink-2 hover:border-accent hover:text-accent-ink')
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
            onClick={() => choose(remainingHours)}
            aria-pressed={picked === +remainingHours.toFixed(2) && !customValid}
            title={`Chọn ${remainingHours}h cho đủ ngày · ${slotFor(remainingHours)}`}
            className={
              'h-8 rounded-lg border px-3 text-small font-semibold transition-colors disabled:opacity-50 ' +
              (picked === +remainingHours.toFixed(2) && !customValid
                ? chosen
                : 'border-accent/60 bg-accent-soft text-accent-ink hover:border-accent')
            }
          >
            Đủ ngày · {formatDuration(remainingHours * 3600)}
          </button>
        )}

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <form
          className="flex min-w-0 flex-1 basis-[300px] items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            confirm()
          }}
        >
          <label className="relative">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              inputMode="decimal"
              placeholder="1.5"
              aria-label="Số giờ khác"
              className={
                'h-8 w-[68px] rounded-lg border bg-surface pl-2.5 pr-6 font-mono text-small ' +
                (customValid ? 'border-accent' : 'border-line-strong')
              }
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
          {/* The confirmation: says exactly what will be written before it is. */}
          <button
            type="submit"
            disabled={!hours || pending}
            title={hours ? `Ghi ${hours}h vào ${isToday ? 'hôm nay' : dateLabel} · ${slotFor(hours)}` : 'Chọn số giờ trước'}
            className={
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-small font-semibold shadow-card disabled:opacity-40 ' +
              tone
            }
          >
            {hours ? (
              <>
                Log {hours}h
                <span className="font-mono text-caption font-medium opacity-80">· {slotFor(hours)}</span>
              </>
            ) : (
              'Chọn giờ để log'
            )}
          </button>
        </form>
      </div>
      {offNote && <p className="mt-2 text-caption text-ink-3">{offNote}</p>}
    </div>
  )
}
