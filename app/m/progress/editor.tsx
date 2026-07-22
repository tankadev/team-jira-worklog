'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  type ProgressItem,
  progressPercent,
  renderMemberReport,
} from '@/lib/modules/progress/format'

import { saveProgressAction } from './actions'

interface InitialReport {
  id: number
  member: string
  items: ProgressItem[]
}

const emptyItem = (): ProgressItem => ({
  prefix: '',
  feature: '',
  document: '',
  implement: '',
  fix: '',
})

export function ProgressEditor({
  initial,
  today,
}: {
  initial: InitialReport | null
  today: string
}) {
  const [id, setId] = useState<number | undefined>(initial?.id)
  const [member, setMember] = useState(initial?.member ?? '')
  // The date is always today's report by default, never carried over from the
  // last save — the sheet is updated fresh each day.
  const [reportDate, setReportDate] = useState(today)
  const [items, setItems] = useState<ProgressItem[]>(
    initial?.items.length ? initial.items.map((it) => ({ ...it })) : [emptyItem()],
  )
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const [markdown, setMarkdown] = useState(true)

  // The autosave closure reads the id through a ref so it always upserts the
  // same row after the first insert, without the effect re-firing when id lands.
  const idRef = useRef(id)
  useEffect(() => {
    idRef.current = id
  }, [id])

  const preview = useMemo(
    () => renderMemberReport({ member, reportDate, items }, { markdown }),
    [member, reportDate, items, markdown],
  )

  function patchItem(index: number, fields: Partial<ProgressItem>) {
    setItems((list) => list.map((it, i) => (i === index ? { ...it, ...fields } : it)))
  }

  function addItem() {
    setItems((list) => [...list, emptyItem()])
  }

  function removeItem(index: number) {
    setItems((list) => {
      const next = list.filter((_, i) => i !== index)
      return next.length ? next : [emptyItem()]
    })
  }

  const persist = useCallback(async () => {
    setStatus('saving')
    const res = await saveProgressAction({ id: idRef.current, member, reportDate, items })
    if (res.ok) {
      if (res.id) setId(res.id)
      setStatus('saved')
      setErrorMsg('')
    } else {
      setStatus('error')
      setErrorMsg(res.message)
    }
  }, [member, reportDate, items])

  // Autosave once a member is filled: fire ~0.7s after the last edit so a burst
  // of typing writes once, not on every keystroke. The first render is skipped
  // so merely opening the sheet never rewrites it.
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    if (!member.trim()) return
    const t = setTimeout(() => void persist(), 700)
    return () => clearTimeout(t)
  }, [persist, member])

  function saveNow() {
    if (!member.trim()) {
      setStatus('error')
      setErrorMsg('Chưa điền tên member')
      return
    }
    void persist()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(preview)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      const pre = document.getElementById('progress-preview')
      if (pre) {
        const range = document.createRange()
        range.selectNodeContents(pre)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }
  }

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
            Tự lưu khi bạn ngừng gõ · feature xong thì xoá dòng đó
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Feature report</h1>
        </div>
        <div className="flex items-center gap-2">
          {status === 'saved' && <span className="text-[12px] text-good">Đã lưu ✓</span>}
          {status === 'error' && (
            <span className="text-[12px] text-crit">{errorMsg || 'Không lưu được'}</span>
          )}
          <button
            type="button"
            onClick={saveNow}
            disabled={status === 'saving'}
            className="rounded-md bg-accent px-3 py-1 text-[12.5px] font-medium text-white hover:bg-accent-2 disabled:opacity-50"
          >
            {status === 'saving' ? 'Đang lưu…' : 'Lưu tiến độ'}
          </button>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── editor ── */}
        <section className="rounded-[9px] border border-line bg-surface p-[17px]">
          <div className="mb-3 flex flex-wrap gap-3">
            <label className="flex flex-1 flex-col gap-[5px]">
              <span className="text-xs font-medium text-ink-2">Member</span>
              <input
                value={member}
                onChange={(e) => setMember(e.target.value)}
                placeholder="Tên member"
                className="w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13.5px]"
              />
            </label>
            <label className="flex w-[170px] flex-col gap-[5px]">
              <span className="text-xs font-medium text-ink-2">Ngày</span>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px]"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2.5">
            {items.map((it, i) => (
              <div key={i} className="rounded-[8px] border border-line bg-surface p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={it.prefix}
                    onChange={(e) => patchItem(i, { prefix: e.target.value })}
                    placeholder="FR"
                    className="w-16 rounded-[4px] border border-line bg-ground px-2 py-1 text-center font-mono text-[12px] text-epic-ink"
                  />
                  <input
                    value={it.feature}
                    onChange={(e) => patchItem(i, { feature: e.target.value })}
                    placeholder="[Mobile Lite] Tên feature…"
                    className="flex-1 rounded-md border border-line bg-ground px-2.5 py-1 text-[13.5px] font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    aria-label="Xoá feature"
                    className="grid size-6 place-items-center rounded-md text-[15px] leading-none text-ink-3 hover:bg-surface-2 hover:text-crit"
                  >
                    ×
                  </button>
                </div>

                <ProgressRow label="Document" value={it.document} onChange={(v) => patchItem(i, { document: v })} />
                <ProgressRow label="Implement" value={it.implement} onChange={(v) => patchItem(i, { implement: v })} />
                <ProgressRow label="Fix" value={it.fix} onChange={(v) => patchItem(i, { fix: v })} />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="mt-3 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[12.5px] hover:bg-surface-2"
          >
            + Feature
          </button>
        </section>

        {/* ── preview ── */}
        <section className="rounded-[9px] border border-line bg-surface p-[17px] lg:sticky lg:top-5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
              Nội dung gửi group
            </div>
            <div className="flex items-center gap-2.5">
              <label className="flex select-none items-center gap-1.5 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  checked={markdown}
                  onChange={(e) => setMarkdown(e.target.checked)}
                  className="accent-accent"
                />
                Markdown
              </label>
              <button
                type="button"
                onClick={copy}
                className="rounded-md bg-accent px-3 py-[5px] text-[12.5px] font-medium text-white hover:bg-accent-2"
              >
                {copied ? 'Đã copy ✓' : 'Copy'}
              </button>
            </div>
          </div>
          <pre
            id="progress-preview"
            className="overflow-x-auto whitespace-pre-wrap rounded-md border border-line bg-ground px-4 py-3.5 font-mono text-[12.5px] leading-[1.7]"
          >
            {preview}
          </pre>
        </section>
      </div>
    </>
  )
}

function ProgressRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const pct = progressPercent(value)
  return (
    <div className="grid grid-cols-[92px_1fr_78px] items-center gap-2.5 py-[3px]">
      <span className="text-[12px] text-ink-2">{label}</span>
      <div className="h-[7px] overflow-hidden rounded-full bg-surface-2">
        <i
          className="block h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Todo"
        className="rounded-[6px] border border-line bg-ground px-2 py-1 text-right font-mono text-[12px]"
      />
    </div>
  )
}
