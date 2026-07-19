'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { todayIn } from '@/lib/time'

import { NavSpinner, useNav } from './navigation'

interface SprintOption {
  id: number
  name: string
  current: boolean
  start: string | null
  end: string | null
}

function dm(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''
}

export function BoardFilters({
  sprints,
  sprintId,
  status,
  search,
  noSprintMatch,
  epics,
  epicKey,
  parents,
  parentKey,
}: {
  sprints: SprintOption[]
  sprintId: number | null
  status: string
  search: string
  noSprintMatch: boolean
  epics: Array<{ key: string; name: string }>
  epicKey: string
  parents: Array<{ key: string; summary: string }>
  parentKey: string
}) {
  const params = useSearchParams()
  const { navigate, pending } = useNav()
  const [term, setTerm] = useState(search)

  useEffect(() => setTerm(search), [search])

  function set(key: string, value: string | null) {
    const q = new URLSearchParams(params.toString())
    if (value === null || value === '') q.delete(key)
    else q.set(key, value)
    navigate(q.size ? `/?${q}` : '/')
  }

  /**
   * Moves the logging date along with the sprint.
   *
   * Keeping the old date after switching sprints leaves the capacity bar showing
   * a day outside the sprint you are now looking at, which reads as a bug. The
   * current sprint lands on today; any other sprint lands on its first day,
   * since that is where you would start reviewing it.
   */
  function pickSprint(value: string) {
    const q = new URLSearchParams(params.toString())
    q.set('sprint', value)

    const sprint = sprints.find((s) => String(s.id) === value)
    const today = todayIn()
    const coversToday = Boolean(
      sprint?.start && sprint?.end && today >= sprint.start && today <= sprint.end,
    )

    // No `date` param means today, so deleting it is how we select today.
    if (!sprint || coversToday) q.delete('date')
    else if (sprint.start) q.set('date', sprint.start)

    // These name issues in the sprint being left, so they would filter the new
    // one down to nothing.
    q.delete('epic')
    q.delete('parent')

    navigate(q.size ? `/?${q}` : '/')
  }

  // Jira returns sprints ordered by state then backlog position, so they are
  // split by date here instead — otherwise stale un-closed sprints outrank the
  // real one.
  const current = sprints.filter((s) => s.current)
  const past = sprints.filter((s) => !s.current)

  const control =
    'rounded-md border border-line bg-surface px-[9px] py-[5px] text-[12.5px] text-ink disabled:opacity-60'

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
      <select
        className={control}
        disabled={pending}
        value={sprintId === null ? (noSprintMatch ? 'none' : 'all') : String(sprintId)}
        onChange={(e) => pickSprint(e.target.value)}
      >
        {current.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} · {dm(s.start)} – {dm(s.end)} (đang chạy)
          </option>
        ))}
        {noSprintMatch && <option value="none">Ngày ngoài mọi sprint</option>}
        <option value="all">Mọi sprint</option>
        {past.length > 0 && (
          <optgroup label="Sprint khác">
            {past.slice(0, 30).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {dm(s.start)} – {dm(s.end)}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <select
        className={control}
        disabled={pending}
        value={status}
        onChange={(e) => set('status', e.target.value)}
      >
        <option value="open">Chưa Done</option>
        <option value="all">Mọi trạng thái</option>
      </select>

      {epics.length > 1 && (
        <select
          className={control + ' max-w-[190px]'}
          disabled={pending}
          value={epicKey}
          onChange={(e) => {
            const q = new URLSearchParams(params.toString())
            if (e.target.value) q.set('epic', e.target.value)
            else q.delete('epic')
            q.delete('parent')
            navigate(q.size ? `/?${q}` : '/')
          }}
        >
          <option value="">Mọi epic</option>
          {epics.map((ep) => (
            <option key={ep.key} value={ep.key}>
              {ep.name}
            </option>
          ))}
        </select>
      )}

      {parents.length > 1 && (
        <select
          className={control + ' max-w-[190px]'}
          disabled={pending}
          value={parentKey}
          onChange={(e) => set('parent', e.target.value)}
        >
          <option value="">Mọi task cha</option>
          {parents.map((p) => (
            <option key={p.key} value={p.key}>
              {p.key} — {p.summary}
            </option>
          ))}
        </select>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          set('q', term)
        }}
      >
        <input
          type="search"
          value={term}
          disabled={pending}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Lọc task…"
          className={control + ' w-[150px]'}
        />
      </form>

      {(search || sprintId === null || status === 'all' || epicKey || parentKey) && (
        <button
          onClick={() => navigate('/')}
          disabled={pending}
          className="rounded-md border border-line px-[9px] py-[5px] text-[12.5px] text-ink-3 hover:border-line-strong hover:text-ink disabled:opacity-60"
        >
          Bỏ lọc
        </button>
      )}

      <NavSpinner />
    </div>
  )
}
