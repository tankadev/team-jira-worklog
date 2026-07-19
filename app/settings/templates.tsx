'use client'

import { useState, useTransition } from 'react'

import { Working } from '../spinner'
import {
  deleteTemplateAction,
  saveTemplateAction,
  setDefaultTemplateAction,
} from './template-actions'

interface T {
  id: number
  name: string
  body: string
  isDefault: boolean
}

const PLACEHOLDERS: Array<[string, string]> = [
  ['{{date}}', 'ngày báo cáo, 18-06-2026'],
  ['{{next_date}}', 'ngày kế tiếp'],
  ['{{total}}', 'tổng giờ, 8h'],
  ['{{count}}', 'số task'],
  ['{{name}}', 'tên bạn'],
  ['{{sprint}}', 'tên sprint'],
  ['{{#issues}}…{{/issues}}', 'lặp qua từng task'],
  ['{{key}}', 'mã task, trong khối lặp'],
  ['{{summary}}', 'tiêu đề task, trong khối lặp'],
  ['{{time}}', 'giờ của task, trong khối lặp'],
]

export function TemplateManager({ initial }: { initial: T[] }) {
  const [templates, setTemplates] = useState(initial)
  const [editing, setEditing] = useState<number | null>(initial[0]?.id ?? null)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const active = templates.find((t) => t.id === editing) ?? templates[0]

  function patch(id: number, fields: Partial<T>) {
    setTemplates((list) => list.map((t) => (t.id === id ? { ...t, ...fields } : t)))
  }

  function save() {
    if (!active) return
    startTransition(async () => {
      const res = await saveTemplateAction({
        id: active.id > 0 ? active.id : undefined,
        name: active.name,
        body: active.body,
      })
      setResult(res)
    })
  }

  function addNew() {
    // Negative id marks a row that exists only on the client until first save.
    const draft: T = {
      id: -Date.now(),
      name: 'Template mới',
      body: 'Daily Report {{next_date}}\n\n{{#issues}}\n- {{key}} | {{summary}}\n{{/issues}}',
      isDefault: false,
    }
    setTemplates((list) => [...list, draft])
    setEditing(draft.id)
    setResult(null)
  }

  return (
    <section className="rounded-[9px] border border-line bg-surface p-[17px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
          Template report
        </div>
        <button
          type="button"
          onClick={addNew}
          className="rounded-md border border-dashed border-line-strong px-[9px] py-1 text-[12px] text-ink-3 hover:border-solid hover:text-ink"
        >
          + Template mới
        </button>
      </div>

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setEditing(t.id)
              setResult(null)
            }}
            className={
              'rounded-full border px-[11px] py-[3px] text-[11.5px] ' +
              (t.id === active?.id
                ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                : 'border-line text-ink-2 hover:border-line-strong hover:text-ink')
            }
          >
            {t.name}
            {t.isDefault && ' ★'}
          </button>
        ))}
      </div>

      {active && (
        <div className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-[5px]">
            <span className="text-xs font-medium text-ink-2">Tên</span>
            <input
              value={active.name}
              onChange={(e) => patch(active.id, { name: e.target.value })}
              className="w-full rounded-md border border-line bg-ground px-[10px] py-[7px] text-[13.5px]"
            />
          </label>

          <label className="flex flex-col gap-[5px]">
            <span className="text-xs font-medium text-ink-2">Nội dung</span>
            <textarea
              rows={10}
              value={active.body}
              onChange={(e) => patch(active.id, { body: e.target.value })}
              className="w-full resize-y rounded-md border border-line bg-ground px-[10px] py-[7px] font-mono text-[12.5px] leading-[1.6]"
            />
          </label>

          <details className="rounded-md border border-line bg-ground px-3 py-2">
            <summary className="cursor-pointer text-[12px] text-ink-2">Biến dùng được</summary>
            <div className="mt-2 grid gap-x-3 gap-y-1 sm:grid-cols-2">
              {PLACEHOLDERS.map(([token, desc]) => (
                <div key={token} className="flex gap-2 text-[11.5px]">
                  <code className="shrink-0 font-mono text-accent-ink">{token}</code>
                  <span className="text-ink-3">{desc}</span>
                </div>
              ))}
            </div>
          </details>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {result && (
              <span className={'mr-auto text-[12px] ' + (result.ok ? 'text-good' : 'text-crit')}>
                {result.message}
              </span>
            )}

            {active.id > 0 && !active.isDefault && (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await setDefaultTemplateAction(active.id)
                      setResult(res)
                      if (res.ok)
                        setTemplates((list) =>
                          list.map((t) => ({ ...t, isDefault: t.id === active.id })),
                        )
                    })
                  }
                  className="rounded-md border border-line-strong px-[9px] py-1 text-[12.5px] hover:bg-surface-2 disabled:opacity-60"
                >
                  {pending ? <Working>Đang đổi…</Working> : 'Đặt mặc định'}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deleteTemplateAction(active.id)
                      setResult(res)
                      if (res.ok) {
                        setTemplates((list) => list.filter((t) => t.id !== active.id))
                        setEditing(null)
                      }
                    })
                  }
                  className="rounded-md border border-line px-[9px] py-1 text-[12.5px] text-crit hover:border-crit disabled:opacity-60"
                >
                  {pending ? <Working>Đang xoá…</Working> : 'Xoá'}
                </button>
              </>
            )}

            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-md bg-accent px-3 py-1 text-[12.5px] font-medium text-white hover:bg-accent-2 disabled:opacity-60"
            >
              {pending ? <Working>Đang lưu…</Working> : 'Lưu template'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
