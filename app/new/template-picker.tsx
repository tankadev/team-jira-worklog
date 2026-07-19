'use client'

import { useState, useTransition } from 'react'

import { Working } from '../spinner'
import { deleteTaskTemplateAction, saveTaskTemplateAction } from './actions'

export interface TaskTemplateSummary {
  id: number
  name: string
  title: string
  description: string
  dod: string
  prefixes: string[]
  issueTypeId: string | null
  storyPoints: number | null
  useCount: number
}

/**
 * Templates for work that repeats every sprint.
 *
 * Applying one fills the content fields and leaves the parent alone: the same
 * recurring task hangs off a different parent each sprint, and that choice is
 * exactly what the user still has to make. The sprint prefix is likewise not
 * stored — it is re-derived from the current sprint, so a template saved during
 * sprint 65 produces `[spt 66]` when used in sprint 66.
 */
export function TemplatePicker({
  templates,
  activeId,
  onApply,
  onSaved,
  current,
}: {
  templates: TaskTemplateSummary[]
  activeId?: number
  onApply: (t: TaskTemplateSummary) => void
  onSaved: () => void
  current: {
    title: string
    description: string
    dod: string
    prefixes: string[]
    issueTypeId: string | null
    storyPoints: number | null
  }
}) {
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null)
  const [confirming, setConfirming] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    const name = prompt('Tên mẫu, ví dụ "Support review PR hằng sprint"')
    if (!name) return
    startTransition(async () => {
      const res = await saveTaskTemplateAction({ name, ...current })
      setNote(res)
      if (res.ok) onSaved()
    })
  }

  function remove(id: number) {
    startTransition(async () => {
      const res = await deleteTaskTemplateAction(id)
      setNote(res)
      setConfirming(null)
      if (res.ok) onSaved()
    })
  }

  return (
    <section className="rounded-[9px] border border-line bg-surface p-[17px]">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
          Mẫu task lặp lại
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending || !current.title.trim()}
          title={
            current.title.trim()
              ? 'Lưu nội dung hiện tại thành mẫu dùng lại ở sprint sau'
              : 'Cần có title trước'
          }
          className="rounded-md border border-dashed border-line-strong px-[9px] py-1 text-[12px] text-ink-3 hover:border-solid hover:text-ink disabled:opacity-50"
        >
          {pending ? <Working>Đang lưu…</Working> : '+ Lưu thành mẫu'}
        </button>
      </div>

      {templates.length === 0 ? (
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Chưa có mẫu nào. Soạn xong một task hay lặp lại giữa các sprint rồi bấm{' '}
          <b className="font-medium text-ink-2">Lưu thành mẫu</b> — lần sau chỉ cần chọn mẫu và gắn
          task cha mới.
        </p>
      ) : (
        <div className="flex flex-col">
          {templates.map((t, i) => (
            <div
              key={t.id}
              className={
                'flex items-center gap-2 py-[6px] ' + (i ? 'border-t border-line' : '')
              }
            >
              <button
                type="button"
                onClick={() => onApply(t)}
                className={
                  'min-w-0 flex-1 truncate text-left text-[12.5px] ' +
                  (t.id === activeId ? 'font-semibold text-accent-ink' : 'hover:text-accent-ink')
                }
                title={t.title}
              >
                {t.id === activeId && '● '}
                {t.name}
              </button>

              {t.useCount > 0 && (
                <span
                  className="shrink-0 font-mono text-[10.5px] text-ink-3"
                  title={`Đã dùng ${t.useCount} lần`}
                >
                  ×{t.useCount}
                </span>
              )}

              {confirming === t.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(t.id)}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-crit hover:bg-crit-soft disabled:opacity-60"
                  >
                    {pending ? <Working>Xoá…</Working> : 'Xoá?'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="rounded px-1 py-0.5 text-[11px] text-ink-3 hover:text-ink"
                  >
                    huỷ
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(t.id)}
                  className="shrink-0 rounded px-1 text-[13px] leading-none text-ink-3 hover:text-crit"
                  aria-label={`Xoá mẫu ${t.name}`}
                  title="Xoá mẫu"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {note && (
        <p className={'mt-2 text-[11.5px] ' + (note.ok ? 'text-good' : 'text-crit')}>
          {note.message}
        </p>
      )}
    </section>
  )
}
