'use client'

import { useState, useTransition } from 'react'

import { MODULES } from '@/lib/modules/registry'

import { toggleModuleAction } from './module-actions'

export function ModuleManager({ states }: { states: Record<string, boolean> }) {
  const [enabled, setEnabled] = useState(states)
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(id: string) {
    const next = !enabled[id]
    // Optimistic: the switch should feel instant even though the nav behind it
    // re-renders through the server.
    setEnabled((s) => ({ ...s, [id]: next }))
    startTransition(async () => {
      const res = await toggleModuleAction(id, next)
      setNote(res)
      if (!res.ok) setEnabled((s) => ({ ...s, [id]: !next }))
    })
  }

  return (
    <section id="modules" className="rounded-[9px] border border-line bg-surface p-[17px] scroll-mt-5">
      <div className="mb-1 flex items-center justify-between">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
          Modules · bật thứ bạn cần
        </div>
        {note && (
          <span className={'text-[12px] ' + (note.ok ? 'text-good' : 'text-crit')}>
            {note.message}
          </span>
        )}
      </div>

      {MODULES.map((m) => {
        const on = enabled[m.id] ?? false
        return (
          <div key={m.id} className="flex items-start gap-3.5 border-t border-line py-3.5 first:border-t-0">
            <div className="grid size-[34px] flex-none place-items-center rounded-[9px] bg-surface-2 text-[17px]">
              {m.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <b className="text-[13.5px] font-semibold">{m.name}</b>
                {m.status === 'wip' && (
                  <span className="rounded-full border border-line px-[7px] py-px font-mono text-[10px] text-ink-3">
                    đang phát triển
                  </span>
                )}
                {m.configHint && (
                  <span className="rounded-full bg-warn-soft px-[7px] py-px font-mono text-[10px] text-warn">
                    {m.configHint}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{m.description}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <span className="rounded-full border border-transparent bg-accent-soft px-[7px] py-px font-mono text-[10px] text-accent-ink">
                  {m.nav.href}
                </span>
                {m.tables?.map((t) => (
                  <span key={t} className="rounded-full border border-line bg-surface px-[7px] py-px font-mono text-[10px] text-ink-2">
                    bảng: {t}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`Bật/tắt ${m.name}`}
              disabled={pending}
              onClick={() => toggle(m.id)}
              className={
                'relative mt-0.5 h-[23px] w-10 flex-none rounded-full transition-colors disabled:opacity-60 ' +
                (on ? 'bg-accent' : 'bg-line-strong')
              }
            >
              <span
                className={
                  'absolute top-0.5 size-[19px] rounded-full bg-white shadow transition-[left] ' +
                  (on ? 'left-[19px]' : 'left-0.5')
                }
              />
            </button>
          </div>
        )
      })}

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
        Tắt module chỉ ẩn nav và chặn route của nó — dữ liệu vẫn được giữ.
      </p>
    </section>
  )
}
