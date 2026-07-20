'use client'

import { useState, useTransition } from 'react'

import { setDayOffAction } from '@/app/day-off-actions'
import { DAY_OFF_LABEL, type DayOffKind } from '@/lib/quota'

import { Spinner } from '../spinner'
import { useNav } from './navigation'
import { Popover } from './popover'

/**
 * Marks a day as leave, from the day it belongs to.
 *
 * Sits on each row rather than on the selected day's card so a whole sprint can
 * be corrected in one pass — leave is usually remembered afterwards, in a batch,
 * not on the day itself.
 */
export function DayOffButton({
  date,
  current,
  label,
}: {
  date: string
  current: DayOffKind | null
  label: string
}) {
  const [kind, setKind] = useState<DayOffKind | null>(current)
  const [pending, startTransition] = useTransition()
  const { refresh } = useNav()

  function set(next: DayOffKind | null, close: () => void) {
    const previous = kind
    setKind(next)
    close()
    startTransition(async () => {
      const res = await setDayOffAction(date, next)
      if (res.ok) refresh()
      else setKind(previous)
    })
  }

  return (
    <Popover
      align="right"
      panelClassName="w-[150px] p-1"
      trigger={(open) => (
        <span
          role="button"
          tabIndex={0}
          title={kind ? DAY_OFF_LABEL[kind] : `Đánh dấu ngày nghỉ · ${label}`}
          className={
            'grid size-[18px] shrink-0 place-items-center rounded text-[11px] leading-none transition-opacity ' +
            (kind
              ? 'text-ot opacity-100'
              : open
                ? 'text-accent-ink opacity-100'
                : 'text-ink-3 opacity-0 group-hover:opacity-100')
          }
        >
          {pending ? <Spinner className="size-2.5" /> : kind ? '⊘' : '⊕'}
        </span>
      )}
    >
      {(close) => (
        <>
          {(['full', 'morning', 'afternoon'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => set(k, close)}
              aria-pressed={kind === k}
              className={
                'block w-full rounded px-2 py-[5px] text-left text-[12px] ' +
                (kind === k
                  ? 'bg-accent-soft font-medium text-accent-ink'
                  : 'hover:bg-surface-2')
              }
            >
              {DAY_OFF_LABEL[k]}
            </button>
          ))}
          {kind && (
            <button
              type="button"
              onClick={() => set(null, close)}
              className="mt-0.5 block w-full rounded border-t border-line px-2 py-[5px] text-left text-[12px] text-ink-3 hover:text-crit"
            >
              Bỏ đánh dấu
            </button>
          )}
        </>
      )}
    </Popover>
  )
}
