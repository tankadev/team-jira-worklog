'use client'

import { useState, useTransition } from 'react'

import type { FoundIssue } from '@/lib/jira/find'
import { statusTone } from '@/lib/jira/types'

import { assignToMeAction } from './actions'

const TONE: Record<string, string> = {
  todo: 'bg-surface-2 text-ink-2',
  prog: 'bg-accent-soft text-accent-ink',
  test: 'bg-warn-soft text-warn',
  ver: 'bg-blue-soft text-blue',
  done: 'bg-good-soft text-good',
}

export function ResultList({
  issues,
  myAccountId,
  emptyHint,
}: {
  issues: FoundIssue[]
  myAccountId: string
  emptyHint: string
}) {
  if (!issues.length) {
    return (
      <div className="rounded-[9px] border border-dashed border-line-strong bg-surface p-8 text-center">
        <p className="text-[12.5px] text-ink-3">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[7px]">
      {issues.map((issue) => (
        <Row key={issue.key} issue={issue} mine={issue.assigneeAccountId === myAccountId} />
      ))}
    </div>
  )
}

function Row({ issue, mine }: { issue: FoundIssue; mine: boolean }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function take() {
    startTransition(async () => {
      const res = await assignToMeAction(issue.key)
      setResult(res)
      if (res.ok) setDone(true)
    })
  }

  return (
    <article className="grid items-center gap-3.5 rounded-[9px] border border-line bg-surface px-3.5 py-[11px] md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-[3px] flex flex-wrap items-center gap-[7px]">
          <span className="font-mono text-[11.5px] font-semibold text-accent-ink">{issue.key}</span>
          <span
            className={
              'rounded-[4px] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] ' +
              TONE[statusTone(issue.statusName)]
            }
          >
            {issue.statusName}
          </span>
          <span className="rounded-[3px] bg-blue-soft px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-blue">
            {issue.issueTypeName}
          </span>
        </div>

        <div className="mb-1 text-[13.5px]">{issue.summary}</div>

        <div className="flex flex-wrap items-center gap-2.5 text-[11.5px] text-ink-3">
          {issue.storyPoints !== null && (
            <span className="rounded bg-surface-2 px-[7px] py-0.5 font-mono text-[11px]">
              SP {issue.storyPoints}
            </span>
          )}
          {issue.parentKey && (
            <span>
              Cha <b className="font-mono font-medium text-ink-2">{issue.parentKey}</b>
            </span>
          )}
          {issue.sprintName && <span>{issue.sprintName}</span>}
          <span>
            {done || mine ? (
              <b className="font-medium text-good">của bạn</b>
            ) : issue.assigneeName ? (
              <>
                Đang giao cho <b className="font-medium text-ink-2">{issue.assigneeName}</b>
              </>
            ) : (
              'Chưa ai nhận'
            )}
          </span>
        </div>

        {result && !result.ok && <p className="mt-1.5 text-[11.5px] text-crit">{result.message}</p>}
      </div>

      <div className="flex items-center gap-2">
        {done ? (
          <span className="text-[12.5px] font-medium text-good">Đã nhận ✓</span>
        ) : mine ? (
          <span className="text-[12px] text-ink-3">—</span>
        ) : (
          <button
            type="button"
            onClick={take}
            disabled={pending}
            className={
              'rounded-md px-[9px] py-1 text-[12.5px] font-medium disabled:opacity-60 ' +
              (issue.assigneeName
                ? 'border border-line-strong bg-surface hover:bg-surface-2'
                : 'bg-accent text-white hover:bg-accent-2')
            }
          >
            {pending ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-current/30 border-t-current" />
                Đang nhận…
              </span>
            ) : issue.assigneeName ? (
              'Nhận về mình'
            ) : (
              'Nhận task'
            )}
          </button>
        )}
      </div>
    </article>
  )
}
