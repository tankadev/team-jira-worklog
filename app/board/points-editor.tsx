'use client'

import { useEffect, useState, useTransition } from 'react'

import { setStoryPointsAction } from '@/app/actions'

import { Spinner } from '../spinner'
import { useNav } from './navigation'
import { Popover, PopoverTitle } from './popover'

/**
 * Story point shown as a chip; editing happens in a popover.
 *
 * Points are read constantly but changed rarely, so the row shows just the
 * number and spends its width on hours and the Log button instead. A red chip
 * means logged time has passed the estimate — a warning, never a block.
 */
export function PointsEditor({
  issueKey,
  value,
  suggestion,
  budgets,
  spentSeconds,
  variant = 'subtask',
  readOnly = false,
  readOnlyReason,
}: {
  issueKey: string
  value: number | null
  /** Sum of the children's points, offered as a one-click fix when they differ. */
  suggestion?: number | null
  /** Point → hour range, for the labels under each choice. */
  budgets?: Record<number, string>
  spentSeconds?: number
  variant?: 'subtask' | 'parent'
  /** Someone else's task — show the estimate, do not offer to change it. */
  readOnly?: boolean
  readOnlyReason?: string
}) {
  const [points, setPoints] = useState<number | null>(value)
  const [draft, setDraft] = useState(String(value ?? ''))
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { refresh } = useNav()

  useEffect(() => {
    setPoints(value)
    setDraft(String(value ?? ''))
  }, [value])

  const mismatch = suggestion != null && suggestion !== points
  const over = overBudget(points, budgets, spentSeconds)

  function save(next: number | null, close?: () => void) {
    const previous = points
    setPoints(next)
    setNote(null)
    close?.()
    startTransition(async () => {
      const res = await setStoryPointsAction(issueKey, next)
      if (res.ok) refresh()
      else {
        setPoints(previous)
        setNote(res.message)
      }
    })
  }

  const label = variant === 'parent' ? `${points ?? '—'} SP` : (points ?? '—')

  if (readOnly) {
    return (
      <span
        title={readOnlyReason ?? `Story point của ${issueKey}`}
        className="inline-flex h-6 min-w-[26px] cursor-default items-center justify-center gap-1 rounded-[5px] bg-surface-2 px-1.5 font-mono text-small text-ink-3"
      >
        {label}
      </span>
    )
  }

  return (
    <Popover
      align="right"
      panelClassName="w-[214px]"
      trigger={(open) => (
        <button
          type="button"
          disabled={pending}
          title={
            over ? 'Đã log quá ước lượng — chỉ cảnh báo, không chặn' : `Story point của ${issueKey}`
          }
          className={
            'control inline-flex h-6 min-w-[26px] items-center justify-center gap-1 rounded-[5px] bg-surface px-1.5 font-mono text-small hover:bg-surface-2 disabled:opacity-60 ' +
            (over
              ? 'border-crit text-crit'
              : mismatch
                ? 'border-dashed border-warn text-warn hover:border-solid'
                : open
                  ? 'border-accent text-accent-ink'
                  : 'border-line-strong text-ink-2 hover:border-accent hover:text-accent-ink')
          }
        >
          {pending ? <Spinner className="size-2.5" /> : label}
        </button>
      )}
    >
      {(close) => (
        <>
          <PopoverTitle>{issueKey} · story point</PopoverTitle>

          {variant === 'subtask' ? (
            <>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => save(p, close)}
                    aria-pressed={points === p}
                    className={
                      'flex flex-1 flex-col items-center gap-px rounded-md border py-[7px] ' +
                      (points === p
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-line bg-ground hover:border-line-strong')
                    }
                  >
                    <b className="font-mono text-lead">{p}</b>
                    <span className="font-mono text-micro text-ink-3">{budgets?.[p] ?? ''}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-caption text-ink-3">Tối đa 3 point.</p>
            </>
          ) : (
            <>
              <input
                type="number"
                min={0}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save(draft === '' ? null : Number(draft), close)
                }}
                className="w-full rounded-md border border-line bg-ground px-2 py-1.5 text-center font-mono text-body tabular"
              />
              <div className="mt-2 flex gap-1.5">
                {mismatch && (
                  <button
                    type="button"
                    onClick={() => save(suggestion!, close)}
                    className="flex-1 rounded-md border border-warn bg-warn-soft py-1 font-mono text-small font-medium text-warn"
                  >
                    Lưu {suggestion} SP
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => save(draft === '' ? null : Number(draft), close)}
                  className="flex-1 rounded-lg bg-accent shadow-card py-1.5 text-small font-semibold text-on-accent hover:bg-accent-2"
                >
                  Lưu
                </button>
              </div>
              <p className="mt-2 text-caption leading-relaxed text-ink-3">
                Point task cha là tổng point task con
                {suggestion != null && (
                  <>
                    {' '}
                    — đang cộng lại <b className="font-mono text-ink-2">{suggestion}</b>
                  </>
                )}
                .
              </p>
            </>
          )}

          {note && <p className="mt-2 text-caption text-crit">{note}</p>}
        </>
      )}
    </Popover>
  )
}

/** Parses "1-2h" / "4h" / "1d-2d" and reports whether logged time passed the top. */
function overBudget(
  points: number | null,
  budgets?: Record<number, string>,
  spentSeconds?: number,
): boolean {
  if (!points || !budgets || !spentSeconds) return false
  const spec = budgets[points]
  if (!spec) return false

  const part = (s: string) => {
    const m = s.trim().match(/^([\d.]+)\s*([hd])?$/i)
    if (!m) return null
    const n = Number(m[1])
    return m[2]?.toLowerCase() === 'd' ? n * 8 : n
  }
  const [lo, hi] = spec.split('-')
  const min = part(lo ?? '')
  if (min === null) return false
  const max = hi ? (part(hi) ?? min) : min
  return spentSeconds / 3600 > max
}


/**
 * Read-only rollup for a parent header.
 *
 * Deliberately has no action of its own. Fixing the number lives in the chip's
 * popover, and offering it twice made the same job look like two different
 * ones. The chip turns amber when these disagree, which is the pointer.
 */
export function PointsRollup({
  value,
  childTotal,
  childCount,
}: {
  value: number | null
  childTotal: number
  childCount: number
}) {
  const matches = value !== null && value === childTotal

  return (
    <span className="font-mono text-caption text-ink-3">
      {childCount} task con · tổng {childTotal} SP
      {matches && <span className="text-good"> · khớp ✓</span>}
    </span>
  )
}


/**
 * Stands in for the points chip on an issue type that carries none (Improve).
 *
 * Normally just a label saying so. If a point was set anyway — before this
 * rule, or from Jira directly — it is shown as the mistake it is, with the one
 * action that fixes it.
 */
export function NoPointsChip({
  issueKey,
  issueTypeName,
  value,
  readOnly = false,
}: {
  issueKey: string
  issueTypeName: string
  value: number | null
  readOnly?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [cleared, setCleared] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const { refresh } = useNav()

  if (value === null || cleared) {
    return (
      <span
        title={`${issueTypeName} không đánh story point`}
        className="badge bg-surface-2 font-normal text-ink-3"
      >
        {issueTypeName} · không point
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        disabled={pending || readOnly}
        onClick={() =>
          startTransition(async () => {
            const res = await setStoryPointsAction(issueKey, null)
            if (res.ok) {
              setCleared(true)
              refresh()
            } else setNote(res.message)
          })
        }
        title={`${issueTypeName} không đánh story point — ${value} SP đang có là sai. Bấm để xoá.`}
        className="control inline-flex h-6 items-center gap-1 rounded-[5px] border-crit bg-surface px-1.5 font-mono text-small text-crit hover:bg-crit-soft disabled:opacity-60"
      >
        {pending ? <Spinner className="size-2.5" /> : <>⚠ {value} SP · xoá</>}
      </button>
      {note && <span className="text-caption text-crit">{note}</span>}
    </span>
  )
}
