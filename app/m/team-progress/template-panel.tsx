'use client'

import { useState, useTransition } from 'react'

import { DEFAULT_TEMPLATE, TEMPLATE_VARIABLES } from '@/lib/modules/team-progress/model'
import type { ProgressTemplate } from '@/lib/modules/team-progress/store'
import { templateProblem } from '@/lib/modules/team-progress/template'

import { Working } from '../../spinner'
import { saveTemplatesAction } from './actions'

/**
 * Template editing, inline on the report screen rather than in Settings: the
 * point of changing a template here is to see the report change, and the
 * output box is right beside it. Edits apply to the preview at once (via
 * `onChange`) and are stored on "Lưu template".
 */
export function TemplatePanel({
  templates,
  activeId,
  onChange,
  onActive,
}: {
  templates: ProgressTemplate[]
  activeId: string
  onChange: (list: ProgressTemplate[]) => void
  onActive: (id: string) => void
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const active = templates.find((t) => t.id === activeId) ?? templates[0]
  const problem = active ? templateProblem(active.body) : null

  function patch(fields: Partial<ProgressTemplate>) {
    onChange(templates.map((t) => (t.id === active.id ? { ...t, ...fields } : t)))
    setResult(null)
  }

  function save(list = templates) {
    startTransition(async () => setResult(await saveTemplatesAction(list)))
  }

  function addNew() {
    const t: ProgressTemplate = { id: `t${Date.now()}`, name: 'Template mới', body: active?.body ?? DEFAULT_TEMPLATE, isDefault: false }
    onChange([...templates, t])
    onActive(t.id)
    setResult(null)
  }

  if (!active) return null

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onActive(t.id)}
            className={
              'rounded-full border px-[11px] py-[3px] text-small ' +
              (t.id === active.id
                ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                : 'border-line text-ink-2 hover:border-line-strong hover:text-ink')
            }
          >
            {t.name}
            {t.isDefault && ' ★'}
          </button>
        ))}
        <button
          type="button"
          onClick={addNew}
          className="rounded-full border border-dashed border-line-strong px-[11px] py-[3px] text-small text-ink-3 hover:border-solid hover:text-ink"
        >
          + Template mới
        </button>
      </div>

      <input
        value={active.name}
        onChange={(e) => patch({ name: e.target.value })}
        className="rounded-lg border border-line bg-ground px-3 py-1.5 text-body"
        aria-label="Tên template"
      />
      <textarea
        rows={16}
        value={active.body}
        onChange={(e) => patch({ body: e.target.value })}
        spellCheck={false}
        className="w-full resize-y rounded-lg border border-line bg-ground px-3 py-2 font-mono text-small leading-[1.55]"
        aria-label="Nội dung template"
      />
      {problem && <div className="text-small text-crit">Lỗi template: {problem}</div>}

      <details className="rounded-md border border-line bg-ground px-3 py-2">
        <summary className="cursor-pointer text-small text-ink-2">Biến dùng được</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          {TEMPLATE_VARIABLES.map(([token, desc]) => (
            <div key={token} className="text-small">
              <code className="font-mono text-accent-ink">{token}</code>
              <span className="text-ink-3"> — {desc}</span>
            </div>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {result && <span className={'mr-auto text-small ' + (result.ok ? 'text-good' : 'text-crit')}>{result.message}</span>}
        <button
          type="button"
          onClick={() => patch({ body: DEFAULT_TEMPLATE })}
          className="rounded-md border border-line px-[9px] py-1 text-small text-ink-2 hover:border-line-strong"
        >
          Về mẫu gốc
        </button>
        {!active.isDefault && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const list = templates.map((t) => ({ ...t, isDefault: t.id === active.id }))
              onChange(list)
              save(list)
            }}
            className="rounded-md border border-line-strong px-[9px] py-1 text-small hover:bg-surface-2 disabled:opacity-60"
          >
            Đặt mặc định
          </button>
        )}
        {templates.length > 1 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm(`Xoá template "${active.name}"?`)) return
              const list = templates.filter((t) => t.id !== active.id)
              onChange(list)
              onActive((list.find((t) => t.isDefault) ?? list[0]).id)
              save(list)
            }}
            className="rounded-md border border-line px-[9px] py-1 text-small text-crit hover:border-crit disabled:opacity-60"
          >
            Xoá
          </button>
        )}
        <button
          type="button"
          disabled={pending || Boolean(problem)}
          onClick={() => save()}
          className="rounded-lg bg-accent px-3 py-1.5 text-body font-semibold text-on-accent shadow-card hover:bg-accent-2 disabled:opacity-60"
        >
          {pending ? <Working>Đang lưu…</Working> : 'Lưu template'}
        </button>
      </div>
    </div>
  )
}
