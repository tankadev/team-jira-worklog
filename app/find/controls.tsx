'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { NavSpinner, useNav } from '../board/navigation'
import { Working } from '../spinner'
import { deletePresetAction, savePresetAction } from './actions'

interface SprintOption {
  id: number
  name: string
  current: boolean
  start: string | null
  end: string | null
}

interface Preset {
  id: number
  name: string
  jql: string
  builtin: boolean
}

const TABS = [
  { key: 'sprint', label: 'Sprint đang chạy' },
  { key: 'project', label: 'Toàn project' },
  { key: 'jql', label: 'JQL' },
] as const

function dm(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''
}

export function FindControls({
  tab,
  sprints,
  sprintId,
  owner,
  status,
  scope,
  search,
  jql,
  presets,
  resultCount,
}: {
  tab: string
  sprints: SprintOption[]
  sprintId: number | null
  owner: string
  status: string
  scope: string
  search: string
  jql: string
  presets: Preset[]
  resultCount: number
}) {
  const params = useSearchParams()
  const { navigate, pending } = useNav()
  const [term, setTerm] = useState(search)
  const [jqlText, setJqlText] = useState(jql)
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, startSaving] = useTransition()

  useEffect(() => setTerm(search), [search])
  useEffect(() => setJqlText(jql), [jql])

  function set(patch: Record<string, string | null>) {
    const q = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') q.delete(k)
      else q.set(k, v)
    }
    navigate(q.size ? `/find?${q}` : '/find')
  }

  const control =
    'rounded-md border border-line bg-surface px-[9px] py-[5px] text-[12.5px] text-ink disabled:opacity-60'

  return (
    <>
      <div className="mb-3.5 flex gap-0.5 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={pending}
            onClick={() => set({ tab: t.key })}
            aria-selected={tab === t.key}
            className={
              '-mb-px border-b-2 px-3 py-[7px] text-[13px] disabled:opacity-60 ' +
              (tab === t.key
                ? 'border-accent font-semibold text-accent-ink'
                : 'border-transparent text-ink-3 hover:text-ink')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sprint' && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          <select
            className={control}
            disabled={pending}
            value={sprintId ?? ''}
            onChange={(e) => set({ sprint: e.target.value })}
          >
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {dm(s.start)} – {dm(s.end)}
                {s.current ? ' (đang chạy)' : ''}
              </option>
            ))}
          </select>

          <select
            className={control}
            disabled={pending}
            value={owner}
            onChange={(e) => set({ owner: e.target.value })}
          >
            <option value="unassigned">Chưa ai nhận</option>
            <option value="others">Của người khác</option>
            <option value="all">Tất cả</option>
          </select>

          <SearchBox
            value={term}
            onChange={setTerm}
            onSubmit={() => set({ q: term })}
            disabled={pending}
            className={control}
          />

          <span className="ml-auto text-[11.5px] text-ink-3">
            Subtask không lọc được theo sprint nên không hiện ở đây
          </span>
          <NavSpinner />
        </div>
      )}

      {tab === 'project' && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          <SearchBox
            value={term}
            onChange={setTerm}
            onSubmit={() => set({ q: term })}
            disabled={pending}
            className={control + ' w-[260px]'}
            placeholder="Tìm trong toàn bộ project…"
          />
          <select
            className={control}
            disabled={pending}
            value={status}
            onChange={(e) => set({ status: e.target.value })}
          >
            <option value="open">Chưa Done</option>
            <option value="all">Mọi trạng thái</option>
          </select>
          <select
            className={control}
            disabled={pending}
            value={scope}
            onChange={(e) => set({ scope: e.target.value })}
          >
            <option value="all">Mọi sprint + backlog</option>
            <option value="backlog">Chỉ backlog</option>
          </select>
          <NavSpinner />
        </div>
      )}

      {tab === 'jql' && (
        <div className="mb-3.5 rounded-[9px] border border-line bg-surface p-[17px]">
          <label className="mb-1.5 block text-xs font-medium text-ink-2">JQL</label>
          <textarea
            rows={4}
            value={jqlText}
            disabled={pending}
            onChange={(e) => setJqlText(e.target.value)}
            placeholder='project = VT AND assignee IS EMPTY ORDER BY created DESC'
            className="w-full resize-y rounded-md border border-line bg-ground px-[11px] py-[9px] font-mono text-[12.5px] leading-[1.6]"
          />

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {presets.map((p) => (
              <span key={p.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setJqlText(p.jql)}
                  className="rounded-l-full rounded-r-full border border-line px-[11px] py-[3px] font-mono text-[11.5px] text-ink-2 hover:border-accent hover:text-accent-ink"
                  title={p.jql}
                >
                  {p.name}
                </button>
                {!p.builtin && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      startSaving(async () => setNote(await deletePresetAction(p.id)))
                    }
                    className="-ml-1 rounded-full px-1.5 text-[11px] text-ink-3 hover:text-crit disabled:opacity-40"
                    title="Xoá preset"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <NavSpinner />
            <span className="mr-auto text-[11.5px] text-ink-3">
              {note ? (
                <b className={note.ok ? 'text-good' : 'text-crit'}>{note.message}</b>
              ) : (
                <>
                  Trả về <b className="font-mono tabular text-ink-2">{resultCount}</b> issue
                </>
              )}
            </span>

            <button
              type="button"
              disabled={saving || !jqlText.trim()}
              onClick={() => {
                const name = prompt('Tên preset')
                if (name) startSaving(async () => setNote(await savePresetAction(name, jqlText)))
              }}
              className="rounded-md border border-line-strong bg-surface px-[9px] py-1 text-[12.5px] hover:bg-surface-2 disabled:opacity-60"
            >
              {saving ? <Working>Đang lưu…</Working> : 'Lưu preset'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => set({ jql: jqlText })}
              className="rounded-md bg-accent px-3 py-1 text-[12.5px] font-medium text-white hover:bg-accent-2 disabled:opacity-60"
            >
              {pending ? 'Đang chạy…' : 'Chạy JQL'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function SearchBox({
  value,
  onChange,
  onSubmit,
  disabled,
  className,
  placeholder = 'Tìm theo tiêu đề hoặc key…',
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  disabled: boolean
  className: string
  placeholder?: string
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <input
        type="search"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
      />
    </form>
  )
}
