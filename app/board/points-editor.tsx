'use client'

import { useEffect, useState, useTransition } from 'react'

import { setStoryPointsAction } from '@/app/actions'

import { Spinner } from '../spinner'

/**
 * Inline story point editor.
 *
 * A parent's points are the sum of its children, entered by hand — so the two
 * drift apart constantly. When they disagree the computed sum is offered as a
 * one-click fix, which is the whole reason this control exists rather than
 * sending people to Jira.
 */
export function PointsEditor({
  issueKey,
  value,
  suggestion,
  max,
}: {
  issueKey: string
  value: number | null
  /** Sum of the children's points, when it differs from `value`. */
  suggestion?: number | null
  /** Caps the stepper; parents legitimately exceed the 1–3 subtask scale. */
  max?: number
}) {
  const [points, setPoints] = useState<number | null>(value)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => setPoints(value), [value])

  const mismatch = suggestion != null && suggestion !== points

  function save(next: number | null) {
    const previous = points
    setPoints(next)
    setNote(null)
    startTransition(async () => {
      const res = await setStoryPointsAction(issueKey, next)
      if (!res.ok) {
        setPoints(previous)
        setNote(res.message)
      }
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center rounded-md border border-line-strong bg-surface">
        <span className="px-[7px] font-mono text-[10px] uppercase tracking-[0.05em] text-ink-3">
          SP
        </span>

        <input
          type="number"
          min={0}
          max={max ?? 999}
          value={points ?? ''}
          disabled={pending}
          onChange={(e) => setPoints(e.target.value === '' ? null : Number(e.target.value))}
          onBlur={(e) => {
            const next = e.target.value === '' ? null : Number(e.target.value)
            if (next !== value) save(next)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setPoints(value)
              e.currentTarget.blur()
            }
          }}
          className="h-[26px] w-11 border-x border-line bg-surface text-center font-mono text-[12.5px] tabular disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          aria-label={`Story point của ${issueKey}`}
        />

        <span className="grid w-4 place-items-center px-[3px]">
          {pending && <Spinner className="size-2.5" />}
        </span>
      </span>

      {mismatch && !pending && (
        <button
          type="button"
          onClick={() => save(suggestion)}
          title={`Task con cộng lại là ${suggestion} SP`}
          className="rounded-md border border-warn/50 bg-warn-soft px-[7px] py-[3px] font-mono text-[11px] font-medium text-warn hover:border-warn"
        >
          điền {suggestion}
        </button>
      )}

      {note && <span className="text-[11px] text-crit">{note}</span>}
    </span>
  )
}
