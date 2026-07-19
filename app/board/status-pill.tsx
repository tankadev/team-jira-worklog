'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { transitionAction } from '@/app/actions'
import { type Transition, statusTone } from '@/lib/jira/types'

const TONE: Record<string, string> = {
  todo: 'bg-surface-2 text-ink-2',
  prog: 'bg-accent-soft text-accent-ink',
  test: 'bg-warn-soft text-warn',
  ver: 'bg-blue-soft text-blue',
  done: 'bg-good-soft text-good',
}

/**
 * Status shown as a pill; the transition list is fetched on first open.
 *
 * Transitions are per-issue and per-workflow, so a board of twenty rows would
 * otherwise need twenty requests before it could render. Loading on demand
 * trades a brief wait on click for a board that appears immediately.
 */
export function StatusPill({
  issueKey,
  statusName,
  onChanged,
}: {
  issueKey: string
  statusName: string
  onChanged?: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Transition[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState(statusName)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  async function toggle() {
    if (open) return setOpen(false)
    setOpen(true)
    if (items || loading) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/jira/transitions?key=${encodeURIComponent(issueKey)}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Không lấy được transition')
      setItems(body.transitions ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lấy được transition')
    } finally {
      setLoading(false)
    }
  }

  function choose(t: Transition) {
    setOpen(false)
    startTransition(async () => {
      const res = await transitionAction(issueKey, t.id, t.toStatusName)
      if (res.ok) {
        setCurrent(t.toStatusName)
        onChanged?.(t.toStatusName)
        // The list depends on the new status, so force a refetch next open.
        setItems(null)
        router.refresh()
      } else {
        setError(res.message)
      }
    })
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title="Đổi trạng thái"
        className={
          'inline-flex items-center gap-1 rounded-[4px] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] disabled:opacity-60 ' +
          TONE[statusTone(current)]
        }
      >
        {pending ? (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 animate-spin rounded-full border-[1.5px] border-current/30 border-t-current" />
            đang đổi…
          </span>
        ) : (
          <>
            {current}
            <em className="text-[7px] not-italic opacity-70">▾</em>
          </>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Đóng"
          />
          <div className="absolute left-0 top-6 z-40 flex max-h-64 min-w-[220px] flex-col overflow-y-auto rounded-md border border-line-strong bg-surface p-1 shadow-lg">
            {loading && (
              <span className="flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-ink-3">
                <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
                Đang tải transition…
              </span>
            )}
            {error && <span className="px-2 py-1.5 text-[12px] text-crit">{error}</span>}
            {items?.length === 0 && (
              <span className="px-2 py-1.5 text-[12px] text-ink-3">Không có transition khả dụng</span>
            )}
            {items?.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => choose(t)}
                className="rounded px-2 py-1.5 text-left text-[12px] hover:bg-accent-soft hover:text-accent-ink"
              >
                {/* Jira's transition name can differ from the status it lands on,
                    so show the destination status — that is what the user means. */}
                {t.toStatusName}
                {t.name !== t.toStatusName && (
                  <span className="ml-1.5 text-[10.5px] text-ink-3">({t.name})</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {error && !open && (
        <span className="ml-2 self-center text-[11px] text-crit">{error}</span>
      )}
    </span>
  )
}
