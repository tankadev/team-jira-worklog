'use client'

import { useState } from 'react'

import { Spinner } from '../spinner'

/**
 * Hour chips that only select, and a Log button that confirms — the compact
 * version of the log strip, offered right after a subtask is created.
 *
 * Same rule as the strip: nothing is written until "Log Xh" is pressed.
 */
export function PickAndLog({
  hours,
  isToday,
  pending,
  onLog,
}: {
  hours: number[]
  isToday: boolean
  pending: boolean
  onLog: (hours: number) => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const chosen = isToday ? 'border-accent bg-accent text-on-accent' : 'border-ot bg-ot text-white'
  const idle = isToday
    ? 'border-accent/50 bg-surface text-accent-ink hover:border-accent'
    : 'border-ot/50 bg-surface text-ot hover:border-ot'

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {hours.map((h) => (
        <button
          key={h}
          type="button"
          disabled={pending}
          aria-pressed={picked === h}
          onClick={() => setPicked(h)}
          className={
            'h-7 rounded-md border px-2 font-mono text-caption font-semibold disabled:opacity-50 ' +
            (picked === h ? chosen : idle)
          }
        >
          {h}h
        </button>
      ))}
      <button
        type="button"
        disabled={picked === null || pending}
        onClick={() => picked !== null && onLog(picked)}
        className={
          'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-caption font-semibold shadow-card disabled:opacity-40 ' +
          (isToday ? 'bg-accent text-on-accent hover:bg-accent-2' : 'bg-ot text-white hover:brightness-110')
        }
      >
        {pending ? <Spinner className="size-3" /> : picked === null ? 'Chọn giờ' : `Log ${picked}h`}
      </button>
    </span>
  )
}
