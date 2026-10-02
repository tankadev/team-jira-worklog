'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import {
  type WorklogEditResult,
  logWorkAction,
  moveWorklogAction,
  undoWorklogAction,
  updateWorklogHoursAction,
} from '@/app/actions'
import { type DayStatus, dayStatus, dayStatusText, monthGrid, shiftMonth } from '@/lib/calendar-grid'
import { formatClock, formatDuration } from '@/lib/time'

import { Spinner } from '../spinner'
import { useNav } from './navigation'
import { PickAndLog } from './pick-and-log'

/* ── data ──────────────────────────────────────────────────────────────── */

interface CalendarDay {
  date: string
  seconds: number
  quotaHours: number
  dayOff: 'full' | 'morning' | 'afternoon' | null
  weekend: boolean
}
interface CalendarEntry {
  id: string
  issueKey: string
  date: string
  start: number
  seconds: number
}
interface CalendarMonth {
  month: string
  today: string
  days: CalendarDay[]
  entries: CalendarEntry[]
}

/**
 * One month of day totals plus one issue's worklogs. Kept per month and issue
 * for the session, so hovering a row twice asks once; `reload` after an edit.
 */
const monthCache = new Map<string, CalendarMonth>()

function useCalendarMonth(month: string, issueKey: string, enabled: boolean) {
  const cacheKey = `${issueKey}|${month}`
  // Tagged with its key, so switching months never shows the previous month's days.
  const [state, setState] = useState<{ key: string; value: CalendarMonth } | null>(() => {
    const hit = monthCache.get(cacheKey)
    return hit ? { key: cacheKey, value: hit } : null
  })
  const data = state?.key === cacheKey ? state.value : (monthCache.get(cacheKey) ?? null)
  const setData = (value: CalendarMonth) => setState({ key: cacheKey, value })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (force = false) => {
      if (!force && monthCache.has(cacheKey)) {
        setData(monthCache.get(cacheKey)!)
        return
      }
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/worklog-calendar?month=${month}&key=${encodeURIComponent(issueKey)}`,
        )
        const body = await res.json()
        if (!res.ok) throw new Error(body?.error ?? 'Không tải được lịch')
        monthCache.set(cacheKey, body)
        setData(body)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    },
    [cacheKey, month, issueKey],
  )

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  /** After a write: every cached month is stale (a move touches two days, maybe two months). */
  const reload = useCallback(() => {
    monthCache.clear()
    return load(true)
  }, [load])

  return { data, error, loading, reload }
}

/* ── shared bits ───────────────────────────────────────────────────────── */

const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const STATUS_CELL: Record<DayStatus, string> = {
  off: 'bg-surface-2/60 text-ink-3',
  empty: 'bg-surface',
  short: 'bg-warn-soft/50',
  full: 'bg-good-soft/60',
  over: 'bg-ot-soft/60',
}
const STATUS_TEXT: Record<DayStatus, string> = {
  off: 'text-ink-3',
  empty: 'text-ink-3',
  short: 'text-warn',
  full: 'text-good',
  over: 'text-ot',
}
const STATUS_BAR: Record<DayStatus, string> = {
  off: 'bg-line-strong',
  empty: 'bg-line-strong',
  short: 'bg-warn',
  full: 'bg-good',
  over: 'bg-ot',
}

const dm = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`
const hours = (seconds: number) => +(seconds / 3600).toFixed(2)
const monthLabel = (month: string) => `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`
const entryRange = (e: CalendarEntry) => `${formatClock(e.start)}–${formatClock(e.start + Math.round(e.seconds / 60))}`

/* ── hover card + trigger ──────────────────────────────────────────────── */

/**
 * Wraps the "Hôm nay … · Tổng …" text of a subtask row.
 *
 * Hover: a small month calendar of this task's own hours, and each worklog's
 * day and time range — enough to spot a log on the wrong day. Click: the full
 * calendar, where a worklog can be dragged to another day, resized or removed,
 * and new time logged on any day.
 */
export function TaskLogsTrigger({
  issueKey,
  summary,
  anchorDate,
  presets,
  step,
  children,
}: {
  issueKey: string
  summary: string
  /** The month to open on: the task's latest log, or the board's day. */
  anchorDate: string
  presets: number[]
  step: number
  children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const month = anchorDate.slice(0, 7)
  const { data, loading } = useCalendarMonth(month, issueKey, hover)

  function enter() {
    if (timer.current) clearTimeout(timer.current)
    // A short delay, so moving the pointer across the board does not fetch every row.
    timer.current = setTimeout(() => setHover(true), 280)
  }
  function leave() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setHover(false), 120)
  }

  return (
    <span className="relative inline-flex" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        onClick={() => {
          setHover(false)
          setOpen(true)
        }}
        title="Xem lịch log của task này — bấm để sửa"
        className="rounded-md px-1 py-0.5 text-left underline decoration-line-strong decoration-dotted underline-offset-4 hover:bg-surface-2 hover:decoration-accent"
      >
        {children}
      </button>

      {hover && !open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[300px] rounded-xl border border-line-strong bg-surface p-3 shadow-pop">
          <div className="mb-2 flex items-center gap-2">
            <span className="eyebrow text-ink-2">Đã log · {monthLabel(month)}</span>
            {loading && <Spinner className="size-3 text-ink-3" />}
          </div>
          {data ? <MiniMonth data={data} /> : <div className="h-[150px]" />}
          {data && (
            <ul className="mt-2.5 flex max-h-[120px] flex-col gap-1 overflow-auto text-small">
              {data.entries.filter((e) => e.date.startsWith(month)).length === 0 && (
                <li className="text-ink-3">Tháng này chưa log vào task này.</li>
              )}
              {data.entries
                .filter((e) => e.date.startsWith(month))
                .map((e) => (
                  <li key={e.id} className="flex items-center gap-2 font-mono text-caption">
                    <span className="w-11 text-ink-2">{dm(e.date)}</span>
                    <span className="text-ink-3">{entryRange(e)}</span>
                    <b className="ml-auto font-semibold text-accent-ink">{formatDuration(e.seconds)}</b>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-2 border-t border-line pt-2 text-caption text-ink-3">Bấm để mở lịch — kéo thả để đổi ngày.</p>
        </div>
      )}

      {open && (
        <WorklogCalendarDialog
          issueKey={issueKey}
          summary={summary}
          initialMonth={month}
          presets={presets}
          step={step}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  )
}

/** Days of the month with this task's hours; the rest faded. */
function MiniMonth({ data }: { data: CalendarMonth }) {
  const perDay = new Map<string, number>()
  for (const e of data.entries) perDay.set(e.date, (perDay.get(e.date) ?? 0) + e.seconds)
  return (
    <div className="grid grid-cols-7 gap-0.5 text-center">
      {WEEKDAYS.map((w) => (
        <span key={w} className="pb-0.5 text-micro text-ink-3">
          {w}
        </span>
      ))}
      {data.days.map((d) => {
        const mine = perDay.get(d.date) ?? 0
        const inMonth = d.date.startsWith(data.month)
        return (
          <span
            key={d.date}
            className={
              'flex h-8 flex-col items-center justify-center rounded-md text-micro leading-none ' +
              (!inMonth ? 'opacity-30 ' : '') +
              (mine ? 'bg-accent font-semibold text-on-accent' : d.date === data.today ? 'ring-1 ring-accent' : 'text-ink-3')
            }
            title={mine ? `${dm(d.date)}: ${formatDuration(mine)}` : dm(d.date)}
          >
            <span>{Number(d.date.slice(8))}</span>
            {mine > 0 && <span className="mt-0.5 font-mono text-[9.5px]">{hours(mine)}h</span>}
          </span>
        )
      })}
    </div>
  )
}

/* ── dialog ────────────────────────────────────────────────────────────── */

/**
 * The month as a calendar for one task.
 *
 * Every day shows the whole day's total against its quota (every task, not
 * only this one), coloured short / full / overtime — that is what decides
 * whether a move is right. This task's worklogs sit in their days as chips:
 * drag one to another day to move it, click it to change its hours, move it by
 * date, or delete it. Clicking a day picks it for logging new time.
 */
export function WorklogCalendarDialog({
  issueKey,
  summary,
  initialMonth,
  initialDay = null,
  presets,
  step,
  onClose,
}: {
  issueKey: string
  summary: string
  initialMonth: string
  /** Pre-selected day for logging (when opened from "Chọn ngày khác"). */
  initialDay?: string | null
  presets: number[]
  step: number
  onClose: () => void
}) {
  const { refresh } = useNav()
  const [month, setMonth] = useState(initialMonth)
  const { data, error, loading, reload } = useCalendarMonth(month, issueKey, true)
  const [selected, setSelected] = useState<string | null>(initialDay)
  const [editing, setEditing] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [banner, setBanner] = useState<{ tone: 'good' | 'warn' | 'crit'; text: string; undo?: string[] } | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const grid = data?.days ?? monthGrid(month).map((date) => ({ date, seconds: 0, quotaHours: 0, dayOff: null, weekend: false }))
  const byDay = new Map<string, CalendarEntry[]>()
  for (const e of data?.entries ?? []) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const dayOf = (date: string) => grid.find((d) => d.date === date)

  /** Shows what happened, and above all how the day it landed on now stands. */
  function report(res: WorklogEditResult, undo?: string[]) {
    if (!res.ok) {
      setBanner({ tone: 'crit', text: res.message })
      return
    }
    const day = res.day
    setBanner({
      tone: day && !day.full && day.text.startsWith('còn thiếu') ? 'warn' : 'good',
      text: day ? `${res.message} — ngày ${dm(day.date)} ${day.text}` : res.message,
      undo,
    })
    void reload()
    refresh()
  }

  function move(worklogId: string, toDate: string) {
    const entry = data?.entries.find((e) => e.id === worklogId)
    if (!entry || entry.date === toDate) return
    setEditing(null)
    startTransition(async () => report(await moveWorklogAction({ issueKey, worklogId, toDate })))
  }

  function resize(worklogId: string, h: number) {
    startTransition(async () => {
      setEditing(null)
      report(await updateWorklogHoursAction({ issueKey, worklogId, hours: h }))
    })
  }

  function remove(entry: CalendarEntry) {
    startTransition(async () => {
      setEditing(null)
      const res = await undoWorklogAction({ issueKey, worklogIds: [entry.id] })
      const day = dayOf(entry.date)
      const left = Math.max(0, (day?.seconds ?? 0) - entry.seconds)
      report({
        ...res,
        message: res.ok ? `Đã xoá ${formatDuration(entry.seconds)} ngày ${dm(entry.date)}` : res.message,
        day: res.ok && day ? { date: entry.date, text: dayStatusText(left, day.quotaHours), full: false } : undefined,
      })
    })
  }

  function logOn(date: string, h: number) {
    startTransition(async () => {
      const res = await logWorkAction({ issueKey, hours: h, date })
      const day = dayOf(date)
      const total = (day?.seconds ?? 0) + h * 3600
      report(
        {
          ...res,
          day:
            res.ok && day
              ? {
                  date,
                  text: dayStatusText(total, day.quotaHours),
                  full: day.quotaHours > 0 && total >= day.quotaHours * 3600 - 60,
                }
              : undefined,
        },
        res.ok ? res.worklogIds : undefined,
      )
    })
  }

  function undoLog(ids: string[]) {
    startTransition(async () => {
      const res = await undoWorklogAction({ issueKey, worklogIds: ids })
      setBanner({ tone: res.ok ? 'good' : 'crit', text: res.message })
      void reload()
      refresh()
    })
  }

  const sel = selected ? dayOf(selected) : null
  const selRemaining = sel ? Math.max(0, sel.quotaHours * 3600 - sel.seconds) : 0
  const selHours = [...presets]
  if (selRemaining >= step * 3600 && !selHours.includes(hours(selRemaining))) selHours.push(hours(selRemaining))

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-auto bg-black/55 p-3 backdrop-blur-[3px] sm:p-8">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Lịch log ${issueKey}`}
        className="w-full max-w-[980px] rounded-2xl border border-line-strong bg-surface shadow-pop"
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <div className="flex items-center gap-2">
              <span className="font-mono text-small font-semibold text-accent-ink">{issueKey}</span>
              <span className="text-caption text-ink-3">· lịch log</span>
              {(loading || pending) && <Spinner className="size-3 text-ink-3" />}
            </div>
            <div className="truncate text-body font-medium" title={summary}>
              {summary}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="grid size-8 place-items-center rounded-lg border border-line-strong hover:bg-surface-2" aria-label="Tháng trước">
              ‹
            </button>
            <span className="min-w-[124px] text-center text-body font-semibold">{monthLabel(month)}</span>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="grid size-8 place-items-center rounded-lg border border-line-strong hover:bg-surface-2" aria-label="Tháng sau">
              ›
            </button>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="grid size-8 place-items-center rounded-lg text-xl leading-none text-ink-3 hover:bg-surface-2 hover:text-ink">
            ×
          </button>
        </header>

        <div className="px-4 py-3">
          {banner && (
            <div
              role="status"
              className={
                'mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-small ' +
                (banner.tone === 'good'
                  ? 'border-good/40 bg-good-soft text-good'
                  : banner.tone === 'warn'
                    ? 'border-warn/40 bg-warn-soft text-warn'
                    : 'border-crit/40 bg-crit-soft text-crit')
              }
            >
              <span className="flex-1">{banner.text}</span>
              {banner.undo && banner.undo.length > 0 && (
                <button type="button" onClick={() => undoLog(banner.undo!)} disabled={pending} className="rounded-md border border-line-strong bg-surface px-2 py-0.5 text-caption font-semibold text-ink-2 hover:bg-surface-2">
                  ↶ Hoàn tác
                </button>
              )}
              <button type="button" onClick={() => setBanner(null)} aria-label="Ẩn" className="text-ink-3 hover:text-ink">
                ×
              </button>
            </div>
          )}
          {error && <p className="mb-3 text-small text-crit">{error}</p>}

          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-3">
            <Legend cls="bg-warn" label="thiếu giờ" />
            <Legend cls="bg-good" label="đủ giờ" />
            <Legend cls="bg-ot" label="OT" />
            <Legend cls="bg-line-strong" label="nghỉ / cuối tuần" />
            <span className="ml-auto">
              Kéo thẻ <b className="text-accent-ink">{issueKey}</b> sang ngày khác để chuyển · bấm một ngày để log
            </span>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1 text-center text-caption font-medium text-ink-3">
                {w}
              </div>
            ))}
            {grid.map((d) => {
              // A past workday with nothing logged is a gap to fill, not a blank.
              const raw = dayStatus(d.seconds, d.quotaHours)
              const status: DayStatus = raw === 'empty' && data && d.date < data.today ? 'short' : raw
              const inMonth = d.date.startsWith(month)
              const mine = byDay.get(d.date) ?? []
              const pct = d.quotaHours > 0 ? Math.min(100, (d.seconds / (d.quotaHours * 3600)) * 100) : d.seconds ? 100 : 0
              return (
                <div
                  key={d.date}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(d.date === selected ? null : d.date)}
                  onKeyDown={(e) => e.key === 'Enter' && setSelected(d.date)}
                  onDragOver={(e) => {
                    if (!dragId) return
                    e.preventDefault()
                    setDropOn(d.date)
                  }}
                  onDragLeave={() => setDropOn((cur) => (cur === d.date ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain') || dragId
                    setDropOn(null)
                    setDragId(null)
                    if (id) move(id, d.date)
                  }}
                  className={
                    'flex min-h-[64px] flex-col gap-1 rounded-lg border p-1 text-left transition-colors sm:min-h-[92px] sm:p-1.5 ' +
                    STATUS_CELL[status] +
                    (inMonth ? '' : ' opacity-45') +
                    (selected === d.date ? ' border-accent ring-2 ring-accent/40' : ' border-line') +
                    (dropOn === d.date ? ' border-accent bg-accent-soft' : '') +
                    ' cursor-pointer hover:border-line-strong'
                  }
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={
                        'grid size-5 place-items-center rounded-full text-caption font-semibold ' +
                        (d.date === data?.today ? 'bg-accent text-on-accent' : 'text-ink-2')
                      }
                    >
                      {Number(d.date.slice(8))}
                    </span>
                    <span className={'ml-auto hidden font-mono text-micro font-semibold sm:inline ' + STATUS_TEXT[status]} title={dayStatusText(d.seconds, d.quotaHours)}>
                      {d.quotaHours > 0 ? `${hours(d.seconds)}/${d.quotaHours}h` : d.seconds ? `${hours(d.seconds)}h` : d.dayOff ? 'nghỉ' : ''}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-line">
                    <div className={'h-full rounded-full ' + STATUS_BAR[status]} style={{ width: `${pct}%` }} />
                  </div>
                  {mine.map((e) => (
                    <EntryChip
                      key={e.id}
                      entry={e}
                      editing={editing === e.id}
                      busy={pending}
                      step={step}
                      onEdit={() => setEditing(editing === e.id ? null : e.id)}
                      onDragStart={() => setDragId(e.id)}
                      onDragEnd={() => {
                        setDragId(null)
                        setDropOn(null)
                      }}
                      onResize={(h) => resize(e.id, h)}
                      onMove={(to) => move(e.id, to)}
                      onDelete={() => remove(e)}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>

        {/* Logging on a picked day: the same choose-then-confirm as the board. */}
        <footer className="flex min-h-[56px] flex-wrap items-center gap-3 rounded-b-2xl border-t border-line bg-surface-2/60 px-4 py-2.5 text-small">
          {sel ? (
            <>
              <span>
                Log vào <b className="font-mono">{issueKey}</b> ngày <b>{dm(sel.date)}</b>
                <span className={'ml-1.5 ' + STATUS_TEXT[dayStatus(sel.seconds, sel.quotaHours)]}>
                  · {dayStatusText(sel.seconds, sel.quotaHours)}
                </span>
              </span>
              <span className="ml-auto">
                <PickAndLog
                  key={sel.date}
                  hours={selHours}
                  isToday={sel.date === data?.today}
                  pending={pending}
                  onLog={(h) => logOn(sel.date, h)}
                />
              </span>
            </>
          ) : (
            <span className="text-ink-3">Bấm một ngày trên lịch để log giờ vào ngày đó.</span>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={'inline-block size-2 rounded-full ' + cls} />
      {label}
    </span>
  )
}

/** One worklog of this task inside its day: draggable, and click to edit. */
function EntryChip({
  entry,
  editing,
  busy,
  step,
  onEdit,
  onDragStart,
  onDragEnd,
  onResize,
  onMove,
  onDelete,
}: {
  entry: CalendarEntry
  editing: boolean
  busy: boolean
  step: number
  onEdit: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onResize: (hours: number) => void
  onMove: (toDate: string) => void
  onDelete: () => void
}) {
  const [value, setValue] = useState(String(hours(entry.seconds)))
  const [to, setTo] = useState(entry.date)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const parsed = Number(value.replace(',', '.'))
  const valid = Number.isFinite(parsed) && parsed >= step && parsed !== hours(entry.seconds)

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        draggable={!busy}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', entry.id)
          e.dataTransfer.effectAllowed = 'move'
          onDragStart()
        }}
        onDragEnd={onDragEnd}
        onClick={onEdit}
        title={`${entryRange(entry)} · ${formatDuration(entry.seconds)} — kéo sang ngày khác, hoặc bấm để sửa`}
        className={
          'flex w-full cursor-grab items-center gap-1 rounded-md px-1.5 py-1 text-left font-mono text-micro font-semibold shadow-card active:cursor-grabbing ' +
          (editing ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent-ink hover:bg-accent hover:text-on-accent')
        }
      >
        <span>{formatDuration(entry.seconds)}</span>
        <span className="truncate font-normal opacity-75">{formatClock(entry.start)}</span>
      </button>

      {editing && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-20 w-[264px] rounded-lg border border-line-strong bg-surface p-2.5 text-small shadow-pop">
          <div className="mb-2 font-mono text-caption text-ink-3">
            {dm(entry.date)} · {entryRange(entry)}
          </div>
          <label className="mb-2 flex items-center gap-1.5">
            <span className="w-16 text-caption text-ink-3">Số giờ</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              className="h-7 w-16 rounded-md border border-line-strong bg-ground px-2 font-mono text-small"
            />
            <button type="button" disabled={!valid || busy} onClick={() => onResize(parsed)} className="ml-auto h-7 rounded-md bg-accent px-2.5 text-caption font-semibold text-on-accent disabled:opacity-40">
              Lưu
            </button>
          </label>
          {/* The keyboard / touch way to move — drag and drop needs a mouse. */}
          <label className="mb-2 flex items-center gap-1.5">
            <span className="w-16 text-caption text-ink-3">Sang ngày</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-ground px-1.5 font-mono text-caption"
            />
            <button type="button" disabled={!to || to === entry.date || busy} onClick={() => onMove(to)} className="h-7 rounded-md border border-line-strong px-2 text-caption font-semibold hover:bg-surface-2 disabled:opacity-40">
              Chuyển
            </button>
          </label>
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-caption text-crit">Xoá worklog này?</span>
              <button type="button" onClick={onDelete} disabled={busy} className="ml-auto h-7 rounded-md bg-crit px-2.5 text-caption font-semibold text-white">
                Xoá
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="h-7 rounded-md px-2 text-caption text-ink-3 hover:bg-surface-2">
                Thôi
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="text-caption font-medium text-crit hover:underline">
              Xoá worklog…
            </button>
          )}
        </div>
      )}
    </div>
  )
}
