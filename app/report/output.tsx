'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'

import { NavSpinner, useNav } from '../board/navigation'

export function ReportOutput({
  body,
  templates,
  templateId,
  showKey,
  withInProgress,
  empty,
}: {
  body: string
  date: string
  templates: Array<{ id: number; name: string; isDefault: boolean }>
  templateId: number
  showKey: boolean
  withInProgress: boolean
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

  function toggleKey(next: boolean) {
    const q = new URLSearchParams(params.toString())
    if (next) q.set('key', '1')
    else q.delete('key')
    navigate(`/report?${q}`)
  }

  function toggleInProgress(next: boolean) {
    const q = new URLSearchParams(params.toString())
    // On is the default, so pin the opt-out and drop the param when back on.
    if (next) q.delete('today')
    else q.set('today', '0')
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
    <section className="card p-5">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="eyebrow text-ink-2">
          Nội dung report
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <NavSpinner />
          <label className="flex items-center gap-1.5 text-body text-ink-2 select-none">
            <input
              type="checkbox"
              checked={showKey}
              disabled={pending}
              onChange={(e) => toggleKey(e.target.checked)}
              className="accent-accent disabled:opacity-60"
            />
            Mã task
          </label>
          <label
            className="flex items-center gap-1.5 text-body text-ink-2 select-none"
            title="Đưa các task đang In Progress của bạn vào phần Today"
          >
            <input
              type="checkbox"
              checked={withInProgress}
              disabled={pending}
              onChange={(e) => toggleInProgress(e.target.checked)}
              className="accent-accent disabled:opacity-60"
            />
            Task đang làm
          </label>
          <select
            value={templateId || ''}
            disabled={pending}
            onChange={(e) => pickTemplate(e.target.value)}
            className="h-9 rounded-lg border border-line bg-surface px-3 shadow-card hover:border-line-strong text-body disabled:opacity-60"
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
            className="rounded-lg bg-accent shadow-card px-3 py-1.5 text-body font-semibold text-on-accent hover:bg-accent-2"
          >
            {copied ? 'Đã copy ✓' : 'Copy'}
          </button>
        </div>
      </div>

      <pre
        id="report-body"
        className="whitespace-pre-wrap break-words rounded-xl border border-line bg-ground px-4 py-3.5 font-mono text-small leading-[1.75]"
      >
        {body}
      </pre>

      {empty && (
        <p className="mt-2.5 text-small leading-relaxed text-ink-3">
          Ngày này chưa có worklog nào của bạn, nên phần <b>Previous day</b> đang trống. Đổi ngày ở
          góc trên, hoặc log giờ ở Task board rồi quay lại.
        </p>
      )}
    </section>
  )
}
