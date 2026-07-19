'use client'

import { useSearchParams } from 'next/navigation'
import { useRef } from 'react'

import { addDays, todayIn } from '@/lib/time'

import { NavSpinner, useNav } from '../board/navigation'

/** Same control as the board's, but navigating within /report. */
export function ReportDatePicker({ date, label }: { date: string; label: string }) {
  const params = useSearchParams()
  const { navigate, pending } = useNav()
  const inputRef = useRef<HTMLInputElement>(null)

  function go(next: string) {
    const q = new URLSearchParams(params.toString())
    if (next === todayIn()) q.delete('date')
    else q.set('date', next)
    navigate(q.size ? `/report?${q}` : '/report')
  }

  function openCalendar() {
    const el = inputRef.current
    if (!el) return
    if (typeof el.showPicker === 'function') el.showPicker()
    else el.click()
  }

  const arrow =
    'h-[30px] w-[26px] rounded-md border border-line-strong bg-surface leading-none text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50'

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">
        <NavSpinner />
        Ngày báo cáo
      </span>
      <div className="flex items-center gap-1">
        <button className={arrow} disabled={pending} onClick={() => go(addDays(date, -1))} aria-label="Ngày trước">
          ‹
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={openCalendar}
            disabled={pending}
            className="flex h-[30px] items-center gap-2 rounded-md border border-line-strong bg-surface px-[11px] font-mono text-[12.5px] hover:bg-surface-2 disabled:opacity-60"
          >
            {label}
            <svg viewBox="0 0 16 16" className="size-3.5 text-ink-3" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="2" y="3.5" width="12" height="10.5" rx="1.5" />
              <path d="M2 6.5h12M5.5 2v3M10.5 2v3" strokeLinecap="round" />
            </svg>
          </button>
          <input
            ref={inputRef}
            type="date"
            value={date}
            onChange={(e) => e.target.value && go(e.target.value)}
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 h-0 w-full opacity-0"
          />
        </div>

        <button className={arrow} disabled={pending} onClick={() => go(addDays(date, 1))} aria-label="Ngày sau">
          ›
        </button>

        {date !== todayIn() && (
          <button
            onClick={() => go(todayIn())}
            disabled={pending}
            className="ml-1 h-[30px] rounded-md border border-line-strong bg-surface px-[9px] text-[12.5px] hover:bg-surface-2 disabled:opacity-60"
          >
            Hôm nay
          </button>
        )}
      </div>
    </div>
  )
}
