'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { NavSpinner, useNav } from '../board/navigation'

export function ReportOutput({
  body,
  templates,
  templateId,
  empty,
}: {
  body: string
  date: string
  templates: Array<{ id: number; name: string; isDefault: boolean }>
  templateId: number
  empty: boolean
}) {
  const params = useSearchParams()
  const { navigate, pending } = useNav()
  const [copied, setCopied] = useState(false)

  function pickTemplate(id: string) {
    const q = new URLSearchParams(params.toString())
    q.set('template', id)
    navigate(`/report?${q}`)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard needs a secure context; selecting the text is the fallback.
      const pre = document.getElementById('report-body')
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
    <section className="rounded-[9px] border border-line bg-surface p-[17px]">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
          Nội dung report
        </div>
        <div className="flex items-center gap-1.5">
          <NavSpinner />
          <select
            value={templateId || ''}
            disabled={pending}
            onChange={(e) => pickTemplate(e.target.value)}
            className="rounded-md border border-line bg-surface px-[9px] py-[5px] text-[12.5px] disabled:opacity-60"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isDefault ? ' (mặc định)' : ''}
              </option>
            ))}
          </select>
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
        id="report-body"
        className="overflow-x-auto whitespace-pre rounded-md border border-line bg-ground px-4 py-3.5 font-mono text-[12.5px] leading-[1.7]"
      >
        {body}
      </pre>

      {empty && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3">
          Ngày này chưa có worklog nào của bạn, nên phần <b>Previous day</b> đang trống. Đổi ngày ở
          góc trên, hoặc log giờ ở Task board rồi quay lại.
        </p>
      )}
    </section>
  )
}
