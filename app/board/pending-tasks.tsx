import type { SprintTask } from '@/lib/jira/types'

import { CreateIssueButton } from './create-issue'
import { SprintFixButton } from './sprint-fix'
import { StatusPill } from './status-pill'
import { TypeIcon } from './type-icon'

/**
 * Standard-level issues assigned to the user that hold no subtask of theirs.
 *
 * The board itself lists subtasks, so a Bug or Improve filed by QC and assigned
 * straight to the user is invisible there until a subtask exists under it —
 * including when it is already Done, which is common for QC-filed work whose
 * hours have not been logged. Listing them here is the only route from "this is
 * my work" to "I can log against it".
 */
export function PendingTasks({
  tasks,
  title,
  currentSprint = null,
  teamLabel = null,
}: {
  tasks: SprintTask[]
  title?: string
  /** The sprint being viewed — where a backlog task is offered to move. */
  currentSprint?: { id: number; name: string } | null
  teamLabel?: string | null
}) {
  if (!tasks.length) return null

  return (
    <section className="mt-5 rounded-[14px] border border-dashed border-line-strong bg-surface/60 p-4">
      <div className="mb-1 eyebrow text-ink-2">
        {title ?? 'Task của bạn chưa có task con để log'}
      </div>
      <p className="mb-3 text-small leading-relaxed text-ink-3">
        Giờ chỉ log được vào task con. Bấm <b className="font-medium text-ink-2">+ Task con</b> rồi{' '}
        <b className="font-medium text-ink-2">Tạo nhanh từ task cha</b> để điền sẵn từ tiêu đề và mô tả
        của task đó.
      </p>

      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <div
            key={t.key}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 overflow-hidden rounded-xl border border-line bg-surface px-4 py-3 shadow-card"
          >
            <span className="font-mono text-small font-semibold text-accent-ink">{t.key}</span>

            <span className="inline-flex items-center gap-1 rounded-[5px] bg-blue-soft px-1.5 py-0.5 chip-text text-blue">
              <TypeIcon name={t.issueTypeName} className="size-3" />
              {t.issueTypeName}
            </span>

            {/* The same pill as a parent's header — click to change status. */}
            <StatusPill issueKey={t.key} statusName={t.statusName} issueType={t.issueTypeName} />

            <span className="min-w-[260px] flex-1 basis-[320px]">
              <span className="block text-body font-medium leading-snug">{t.summary}</span>
              {t.epicKey && (
                <span className="mt-0.5 flex items-center gap-1 text-caption text-ink-3">
                  <span className="text-micro">⛓</span>
                  <span className="font-mono">{t.epicKey}</span>
                  {t.epicName && <span className="truncate">· {t.epicName}</span>}
                </span>
              )}
            </span>

            {/* Picked up in Jira but left in the backlog: the subtask route
                works regardless, the fix keeps Jira's own board honest. */}
            {t.outOfSprint && (
              <span
                title={`${t.key} còn ở backlog, chưa thuộc sprint nào`}
                className="badge bg-warn-soft text-warn"
              >
                ⚠ chưa gán sprint
              </span>
            )}
            {t.outOfSprint && currentSprint && (
              <SprintFixButton
                issueKey={t.key}
                sprintId={currentSprint.id}
                sprintName={currentSprint.name}
                addsLabel={
                  teamLabel &&
                  !t.labels.some((l) => l.toLowerCase() === teamLabel.toLowerCase())
                    ? teamLabel
                    : null
                }
              />
            )}

            {t.storyPoints !== null && (
              <span className="rounded bg-surface-2 px-[7px] py-0.5 font-mono text-caption text-ink-3">
                SP {t.storyPoints}
              </span>
            )}

            {/* "No subtask yet" is what this whole section means; only a count
                is worth saying. */}
            {t.subtaskCount > 0 && (
              <span className="text-small text-ink-3">{t.subtaskCount} task con</span>
            )}

            <CreateIssueButton
              parentKey={t.key}
              className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-small font-semibold text-on-accent shadow-card hover:bg-accent-2"
            >
              + Task con
            </CreateIssueButton>
          </div>
        ))}
      </div>
    </section>
  )
}
