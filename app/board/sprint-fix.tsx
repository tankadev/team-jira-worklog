'use client'

import { useState, useTransition } from 'react'

import { setSprintAction } from '@/app/actions'

import { Spinner } from '../spinner'
import { useNav } from './navigation'

/**
 * Puts a sprintless parent into the sprint being viewed, and onto the team's
 * board with it.
 *
 * The board already shows this task's children, so nothing here is required to
 * get work logged — the button exists because the underlying data is wrong
 * everywhere else. A task outside the sprint is missing from Jira's own board,
 * from the burndown and from the sprint report, and the person best placed to
 * notice is the one looking at its children right now.
 *
 * The wording changes with what will actually happen: promising a label it is
 * not going to add is worse than a longer button.
 *
 * Hidden when the task belongs to someone else: fixing your own oversight is
 * housekeeping, quietly re-planning a colleague's task is not.
 */
export function SprintFixButton({
  issueKey,
  sprintId,
  sprintName,
  addsLabel = null,
}: {
  issueKey: string
  sprintId: number
  sprintName: string
  /** Team label this will also add, or null when the task already carries it. */
  addsLabel?: string | null
}) {
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { refresh } = useNav()

  function apply() {
    setNote(null)
    startTransition(async () => {
      const res = await setSprintAction(issueKey, sprintId)
      if (res.ok) refresh()
      else setNote(res.message)
    })
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={apply}
        disabled={pending}
        title={
          `Gán field Sprint của ${issueKey} thành "${sprintName}"` +
          (addsLabel ? ` và thêm label ${addsLabel}` : '') +
          ' — sửa cả trên Jira, không chỉ ở đây'
        }
        className="inline-flex h-[18px] items-center gap-1 rounded-[3px] border border-warn bg-warn-soft px-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-warn hover:brightness-110 disabled:opacity-60"
      >
        {/* Its own element, not a bare string: two adjacent text expressions
            merge into one anonymous flex item and `gap` never applies, which
            left the arrow glued to the word. */}
        <span aria-hidden>{pending ? <Spinner className="size-2.5" /> : '↳'}</span>
        <span>{addsLabel ? 'đưa vào sprint + label' : 'đưa vào sprint'}</span>
      </button>
      {note && <span className="text-[11px] text-crit">{note}</span>}
    </span>
  )
}
