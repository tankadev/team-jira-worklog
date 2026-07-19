'use client'

import { useState, useTransition } from 'react'

import { Working } from '../spinner'
import { savePrefixesAction } from './actions'

/** Accepts `QA` or `[QA]` and always stores the bracketed form. */
function normalise(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return v.startsWith('[') && v.endsWith(']') ? v : `[${v.replace(/^\[|\]$/g, '')}]`
}

/**
 * Multi-select where the order of selection is the order of composition:
 * clicking [BE] then [Mobile] yields `[BE][Mobile]`, the reverse yields
 * `[Mobile][BE]`. The number on each chip shows its position so that is visible
 * rather than something the user has to infer.
 */
export function PrefixPicker({
  library,
  sprintPrefix,
  picked,
  onChange,
}: {
  library: string[]
  sprintPrefix: string | null
  picked: string[]
  onChange: (next: string[]) => void
}) {
  const [items, setItems] = useState(library)
  const [saving, startSaving] = useTransition()

  const all = sprintPrefix ? [sprintPrefix, ...items] : items

  function toggle(label: string) {
    const i = picked.indexOf(label)
    onChange(i === -1 ? [...picked, label] : picked.filter((p) => p !== label))
  }

  function add() {
    const label = normalise(prompt('Tiền tố mới, ví dụ [QA] hoặc [Hotfix]') ?? '')
    if (!label) return
    if (!items.includes(label)) {
      const next = [...items, label]
      setItems(next)
      startSaving(async () => {
        await savePrefixesAction(next)
      })
    }
    if (!picked.includes(label)) onChange([...picked, label])
  }

  return (
    <div className="mb-3 flex flex-col gap-[5px]">
      <span className="text-xs font-medium text-ink-2">
        Tiền tố title{' '}
        <span className="font-normal text-ink-3">· thứ tự bấm là thứ tự ghép</span>
      </span>

      <div className="flex flex-wrap gap-1.5">
        {all.map((label) => {
          const index = picked.indexOf(label)
          const on = index !== -1
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggle(label)}
              aria-pressed={on}
              className={
                'inline-flex items-center gap-1.5 rounded-full border px-[11px] py-[3px] font-mono text-[11.5px] ' +
                (on
                  ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                  : 'border-line bg-surface text-ink-2 hover:border-accent hover:text-accent-ink')
              }
            >
              {on && (
                <span className="-ml-0.5 grid size-3.5 place-items-center rounded-full bg-accent text-[9px] font-bold text-white">
                  {index + 1}
                </span>
              )}
              {label}
            </button>
          )
        })}

        <button
          type="button"
          onClick={add}
          disabled={saving}
          className="rounded-full border border-dashed border-line px-[11px] py-[3px] font-mono text-[11.5px] text-ink-3 hover:border-solid hover:text-ink disabled:opacity-60"
        >
          {saving ? <Working>Đang lưu…</Working> : '+ tiền tố khác'}
        </button>
      </div>

      <p className="text-[11.5px] leading-relaxed text-ink-3">
        Bỏ chọn hết thì title không có tiền tố.
        {sprintPrefix && (
          <>
            {' '}
            <code className="font-mono text-accent-ink">{sprintPrefix}</code> suy ra từ sprint đang
            chạy.
          </>
        )}{' '}
        Sửa danh sách trong Settings.
      </p>
    </div>
  )
}
