'use client'

import { useState, useTransition } from 'react'

import type { FoundIssue } from '@/lib/jira/find'
import { statusStyle } from '@/lib/status-style'

import { assignToMeAction } from './actions'

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
      <div className="rounded-xl border border-dashed border-line-strong bg-surface p-8 text-center">
        <p className="text-body text-ink-3">{emptyHint}</p>
      </div>
    )
  }

  return (
    // One list in one card, rows split by hairlines: a stack of separate
    // cards, each with a loud button, read as a wall rather than a list.
    <div className="card divide-y divide-line overflow-hidden">
      <div className="flex items-center justify-between bg-surface-2/60 px-4 py-2 text-caption text-ink-3">
        <span>
          <b className="font-semibold text-ink-2">{issues.length}</b> task
        </span>
      </div>
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
    <article className="group grid items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/50 md:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-small font-semibold text-accent-ink">{issue.key}</span>
          <span
            className={
              'rounded-[5px] px-[7px] py-[3px] status-text ' +
              statusStyle(issue.statusName)
            }
          >
            {issue.statusName}
          </span>
          <span className="rounded-[5px] bg-blue-soft px-1.5 py-0.5 chip-text text-blue">
            {issue.issueTypeName}
          </span>
        </div>

        <div className="mb-1.5 text-body font-medium leading-snug">{issue.summary}</div>

        <div className="flex flex-wrap items-center gap-2.5 text-small text-ink-3">
          {issue.storyPoints !== null && (
            <span className="rounded bg-surface-2 px-[7px] py-0.5 font-mono text-caption">
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

        {result && !result.ok && <p className="mt-1.5 text-small text-crit">{result.message}</p>}
      </div>

      <div className="flex items-center gap-2">
        {done ? (
          <span className="text-body font-medium text-good">Đã nhận ✓</span>
        ) : mine ? (
          <span className="text-small text-ink-3">—</span>
        ) : (
          <button
            type="button"
            onClick={take}
            disabled={pending}
            className={
              'rounded-lg px-3 py-1.5 text-small font-semibold transition-colors disabled:opacity-60 ' +
              // Outlined until the row is pointed at: one filled button per row
              // shouted over the summaries it sits beside.
              (issue.assigneeName
                ? 'border border-line-strong bg-surface hover:bg-surface-2'
                : 'border border-accent/50 bg-accent-soft text-accent-ink hover:bg-accent hover:text-on-accent group-hover:border-accent')
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
