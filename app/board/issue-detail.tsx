'use client'

import { useEffect, useState } from 'react'

import { type AdfBlock, adfToBlocks } from '@/lib/jira/adf'
import { statusTone } from '@/lib/jira/types'
import { formatDuration } from '@/lib/time'

import { Spinner } from '../spinner'
import { StatusPill } from './status-pill'
import { TypeIcon } from './type-icon'

const TONE: Record<string, string> = {
  todo: 'bg-surface-2 text-ink-2',
  prog: 'bg-accent-soft text-accent-ink',
  test: 'bg-warn-soft text-warn',
  ver: 'bg-blue-soft text-blue',
  done: 'bg-good-soft text-good',
}

interface Detail {
  key: string
  summary: string
  statusName: string
  issueTypeName: string
  storyPoints: number | null
  timeSpentSeconds: number
  parentKey: string | null
  parentSummary: string | null
  sprintName: string | null
  assigneeName: string | null
  description: unknown
  url: string
}

/**
 * Full text of one issue, opened from its key.
 *
 * The compact row shows a truncated summary, which is enough to pick a task but
 * not to read one. This panel carries the parts that were cut — the whole title,
 * the description and the Definition of Done — without giving up the density
 * that made the board scannable.
 */
export function IssueDetail({ issueKey, onClose }: { issueKey: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setError(null)

    fetch(`/api/jira/issue?key=${encodeURIComponent(issueKey)}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body?.error ?? 'Không lấy được chi tiết')
        return body as Detail
      })
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))

    return () => {
      alive = false
    }
  }, [issueKey])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const blocks: AdfBlock[] = detail ? adfToBlocks(detail.description) : []

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-auto bg-black/45 p-6 sm:p-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Chi tiết ${issueKey}`}
        className="w-full max-w-[620px] rounded-xl border border-line-strong bg-surface shadow-2xl"
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TypeIcon name={detail?.issueTypeName || 'Subtask'} className="size-3.5" />
          <a
            href={detail?.url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[12px] font-semibold text-accent-ink underline-offset-2 hover:underline"
            title="Mở trên Jira"
          >
            {issueKey}
          </a>
          {detail && (
            <StatusPill issueKey={detail.key} statusName={detail.statusName} />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="ml-auto grid size-7 place-items-center rounded-md text-[18px] leading-none text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="max-h-[70vh] overflow-auto px-4 py-4">
          {error && <p className="text-[13px] text-crit">{error}</p>}

          {!detail && !error && (
            <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
              <Spinner /> Đang tải chi tiết…
            </p>
          )}

          {detail && (
            <>
              <h2 className="text-[15px] font-semibold leading-snug">{detail.summary}</h2>

              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[12px]">
                {detail.parentKey && (
                  <Row label="Task cha">
                    <span className="font-mono text-ink-2">{detail.parentKey}</span>
                    {detail.parentSummary && (
                      <span className="text-ink-3"> · {detail.parentSummary}</span>
                    )}
                  </Row>
                )}
                {detail.sprintName && <Row label="Sprint">{detail.sprintName}</Row>}
                {detail.assigneeName && <Row label="Giao cho">{detail.assigneeName}</Row>}
                <Row label="Story point">
                  {detail.storyPoints ?? <span className="text-ink-3">chưa đặt</span>}
                </Row>
                <Row label="Đã log">
                  {detail.timeSpentSeconds ? (
                    formatDuration(detail.timeSpentSeconds)
                  ) : (
                    <span className="text-ink-3">chưa log</span>
                  )}
                </Row>
              </dl>

              {blocks.length > 0 ? (
                <div className="mt-4 border-t border-line pt-3.5">
                  {blocks.map((b, i) => (
                    <Block key={i} block={b} />
                  ))}
                </div>
              ) : (
                <p className="mt-4 border-t border-line pt-3.5 text-[12.5px] text-ink-3">
                  Task này chưa có mô tả.
                </p>
              )}
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-surface-2 px-4 py-2.5">
          <span className="font-mono text-[11px] text-ink-3">
            Esc để đóng · bấm mã task để mở trên Jira
          </span>
          <a
            href={detail?.url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="ml-auto rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[12px] hover:bg-surface"
          >
            Mở trên Jira ↗
          </a>
        </footer>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="whitespace-nowrap text-ink-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  )
}

function Block({ block }: { block: AdfBlock }) {
  if (block.kind === 'heading') {
    return (
      <h3 className="mb-1.5 mt-3 text-[13px] font-semibold first:mt-0">{block.text}</h3>
    )
  }
  if (block.kind === 'bullets') {
    return (
      <ul className="mb-2.5 flex list-disc flex-col gap-1 pl-4 text-[12.5px] leading-relaxed">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    )
  }
  return <p className="mb-2.5 text-[12.5px] leading-relaxed">{block.text}</p>
}

/** Status colour for a pill rendered outside this file. */
export function toneClass(status: string) {
  return TONE[statusTone(status)]
}
