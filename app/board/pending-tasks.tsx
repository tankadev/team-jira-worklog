import Link from 'next/link'

import type { SprintTask } from '@/lib/jira/types'
import { statusTone } from '@/lib/jira/types'

import { LinkPending } from '../link-pending'
import { TypeIcon } from './type-icon'

const TONE: Record<string, string> = {
  todo: 'bg-surface-2 text-ink-2',
  prog: 'bg-accent-soft text-accent-ink',
  test: 'bg-warn-soft text-warn',
  ver: 'bg-blue-soft text-blue',
  done: 'bg-good-soft text-good',
}

/**
 * Standard-level issues assigned to the user that hold no subtask of theirs.
 *
 * The board itself lists subtasks, so a Bug or Improve filed by QC and assigned
 * straight to the user is invisible there until a subtask exists under it —
 * including when it is already Done, which is common for QC-filed work whose
 * hours have not been logged. Listing them here is the only route from "this is
 * my work" to "I can log against it".
 */
export function PendingTasks({ tasks, title }: { tasks: SprintTask[]; title?: string }) {
  if (!tasks.length) return null

  return (
    <section className="mt-3 rounded-[9px] border border-dashed border-line-strong bg-surface p-[15px]">
      <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
        {title ?? 'Task của bạn chưa có task con để log'}
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
        Những task này thuộc epic bình thường, chỉ là chưa có task con nào bên dưới — mà giờ chỉ
        log được vào task con.
      </p>

      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <div
            key={t.key}
            className="flex flex-wrap items-center gap-2.5 rounded-md border border-line bg-ground px-3.5 py-2.5"
          >
            <span className="font-mono text-[11.5px] font-semibold text-accent-ink">{t.key}</span>

            <span className="inline-flex items-center gap-1 rounded-[3px] bg-blue-soft px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-blue">
              <TypeIcon name={t.issueTypeName} className="size-3" />
              {t.issueTypeName}
            </span>

            <span
              className={
                'rounded-[4px] px-[7px] py-[3px] text-[10px] font-bold uppercase tracking-[0.05em] ' +
                TONE[statusTone(t.statusName)]
              }
            >
              {t.statusName}
            </span>

            <span className="min-w-[180px] flex-1">
              <span className="block text-[13px]">{t.summary}</span>
              {t.epicKey && (
                <span className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-3">
                  <span className="text-[10px]">⛓</span>
                  <span className="font-mono">{t.epicKey}</span>
                  {t.epicName && <span className="truncate">· {t.epicName}</span>}
                </span>
              )}
            </span>

            {t.storyPoints !== null && (
              <span className="rounded bg-surface-2 px-[7px] py-0.5 font-mono text-[11px] text-ink-3">
                SP {t.storyPoints}
              </span>
            )}

            <span className="font-mono text-[11.5px] text-ink-3">
              {t.subtaskCount === 0 ? 'chưa có task con' : `${t.subtaskCount} task con`}
            </span>

            <Link
              href={`/new?parent=${encodeURIComponent(t.key)}`}
              className="rounded-md bg-accent px-[9px] py-1 text-[12.5px] font-medium text-white hover:bg-accent-2"
            >
              <span className="inline-flex items-center gap-1.5">
                + Task con
                <LinkPending />
              </span>
            </Link>
          </div>
        ))}
      </div>
    </section>
  )
}
