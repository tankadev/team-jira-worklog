'use client'

import { useEffect, useRef, useState } from 'react'

import {
  type EpicKind,
  PHASES,
  type Phase,
  type ProgressEpic,
  type ProgressIssue,
  bugStats,
  epicName,
  isDevDone,
  isFixed,
  plainTitle,
  progressText,
  taskProgress,
} from '@/lib/modules/team-progress/model'
import type { DailyMatch } from '@/lib/modules/team-progress/model'
import { statusStyle } from '@/lib/status-style'

export interface EpicGroup {
  key: string
  epic: ProgressEpic | undefined
  kind: EpicKind
  issues: ProgressIssue[]
  /** Has at least one issue tagged for the report's platform. */
  relevant: boolean
}

export interface RowInfo {
  platforms: string[]
  isNew: boolean
  /** Daily lines the AI matched to this issue. */
  daily?: DailyMatch[]
}

const KIND_LABEL: Record<EpicKind, string> = {
  feature: 'Tính năng',
  bucket: 'Bug tuần',
  support: 'Support',
}

function Check({
  state,
  onChange,
  label,
}: {
  state: boolean | 'some'
  onChange: (next: boolean) => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={state === true}
      onChange={(e) => onChange(e.target.checked)}
      className="size-4 shrink-0 cursor-pointer accent-[var(--color-accent)]"
    />
  )
}

function Status({ name }: { name: string }) {
  return (
    <span className={'shrink-0 whitespace-nowrap rounded-[5px] px-[6px] py-[2px] status-text ' + statusStyle(name)}>
      {name}
    </span>
  )
}

function Bar({ percent }: { percent: number | null }) {
  return (
    <span
      className="flex w-[86px] shrink-0 items-center gap-1.5"
      title={percent === null ? 'Chưa đo được' : `${percent}% — To Do 0%, đang làm 50%, commit code 75%, chờ test trở lên 100%`}
    >
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        <span
          className={'block h-full rounded-full ' + (percent === 100 ? 'bg-good' : 'bg-accent')}
          style={{ width: `${percent ?? 0}%` }}
        />
      </span>
      <span className="w-8 text-right font-mono text-micro text-ink-2">{percent === null ? '—' : `${percent}%`}</span>
    </span>
  )
}

export function EpicCard({
  group,
  picked,
  phases,
  phaseOf,
  info,
  note,
  name,
  expanded,
  jiraBase,
  showSprintFlag,
  onToggleExpand,
  onPick,
  onPhase,
  onNote,
  onName,
}: {
  group: EpicGroup
  picked: Set<string>
  phases: Record<string, Phase>
  phaseOf: (i: ProgressIssue) => Phase
  info: (i: ProgressIssue) => RowInfo
  note: string
  name: string
  expanded: boolean
  jiraBase: string
  /** Whole-feature view: mark tasks that are not in the sprint. */
  showSprintFlag: boolean
  onToggleExpand: () => void
  onPick: (keys: string[], on: boolean) => void
  onPhase: (key: string, phase: Phase | null) => void
  onNote: (note: string) => void
  onName: (name: string) => void
}) {
  const [editingName, setEditingName] = useState(false)
  const keys = group.issues.map((i) => i.key)
  const chosen = group.issues.filter((i) => picked.has(i.key))
  const state: boolean | 'some' = chosen.length === 0 ? false : chosen.length === keys.length ? true : 'some'

  const work = chosen.filter((i) => phaseOf(i) === 'implement')
  const bugs = bugStats(chosen.filter((i) => phaseOf(i) === 'bug'))
  const fullName = group.epic ? epicName(group.epic.summary) : 'Chưa có epic'
  const dailyLines = group.issues.flatMap((i) => info(i).daily ?? [])

  return (
    <section className={'card overflow-hidden ' + (chosen.length ? '' : 'opacity-[0.92]')}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
        <Check state={state} onChange={(on) => onPick(keys, on)} label={`Chọn cả epic ${fullName}`} />
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span aria-hidden className={'text-ink-3 transition-transform ' + (expanded ? 'rotate-90' : '')}>
            ▸
          </span>
          <span className="min-w-0">
            <span className="block truncate text-emph font-semibold" title={group.epic?.summary}>
              {name || fullName}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-micro text-ink-3">
              {group.epic ? (
                <a
                  href={`${jiraBase}/browse/${group.epic.key}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-mono hover:text-accent-ink hover:underline"
                >
                  {group.epic.key}
                </a>
              ) : null}
              <span>{KIND_LABEL[group.kind]}</span>
              <span>
                {chosen.length}/{keys.length} đã chọn
              </span>
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2 text-small">
          {dailyLines.length > 0 && (
            <span className="badge bg-note-soft text-note" title={dailyLines.map((d) => (d.person ? `${d.person}: ${d.line}` : d.line)).join('\n')}>
              daily · {dailyLines.length}
            </span>
          )}
          {work.length > 0 && (
            <span className="badge bg-accent-soft text-accent-ink">Implement {progressText(work)}</span>
          )}
          {bugs.total > 0 && (
            <span
              className={'badge ' + (bugs.fixed === bugs.total ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn')}
              title={`Done ${bugs.done} · Verified ${bugs.verified} · chờ test ${bugs.testing} · đang fix ${bugs.inProgress} · chưa làm ${bugs.todo}`}
            >
              Bug {bugs.fixed}/{bugs.total}
            </span>
          )}
          {!group.relevant && chosen.length === 0 && (
            <span className="badge bg-surface-2 text-ink-3">không có tag nền tảng này</span>
          )}
        </div>
      </header>

      {chosen.length > 0 && group.epic && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2">
          {editingName ? (
            <input
              autoFocus
              defaultValue={name || fullName}
              onBlur={(e) => {
                const v = e.target.value.trim()
                onName(v === fullName ? '' : v)
                setEditingName(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingName(false)
              }}
              className="min-w-[220px] flex-1 rounded-md border border-line bg-ground px-2 py-1 text-small"
              aria-label="Tên hiển thị trong báo cáo"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="rounded-md border border-line px-2 py-1 text-small text-ink-2 hover:border-line-strong hover:text-ink"
              title="Tên epic hiển thị trong báo cáo — chỉ đổi ở đây, không sửa Jira"
            >
              ✎ Tên trong báo cáo
            </button>
          )}
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Ghi chú cho báo cáo, ví dụ: Pending for new design"
            className="min-w-[220px] flex-[2] rounded-md border border-line bg-ground px-2 py-1 text-small"
            aria-label="Ghi chú của epic"
          />
        </div>
      )}

      {expanded && (
        <ul className="divide-y divide-line border-t border-line">
          {group.issues.map((i) => (
            <TaskRow
              key={i.key}
              issue={i}
              picked={picked.has(i.key)}
              phase={phaseOf(i)}
              overridden={i.key in phases}
              info={info(i)}
              jiraBase={jiraBase}
              showSprintFlag={showSprintFlag}
              onPick={(on) => onPick([i.key], on)}
              onPhase={(p) => onPhase(i.key, p)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function TaskRow({
  issue,
  picked,
  phase,
  overridden,
  info,
  jiraBase,
  showSprintFlag,
  onPick,
  onPhase,
}: {
  issue: ProgressIssue
  picked: boolean
  phase: Phase
  overridden: boolean
  info: RowInfo
  jiraBase: string
  showSprintFlag: boolean
  onPick: (on: boolean) => void
  onPhase: (p: Phase | null) => void
}) {
  const p = taskProgress(issue)
  const isBug = phase === 'bug'
  // Two lines: what it is and how far along on the first, the details that
  // explain it on the second — one line squeezed the title to a few words.
  return (
    <li className={'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 py-2 ' + (picked ? '' : 'text-ink-3')}>
      <span className="pt-0.5">
        <Check state={picked} onChange={onPick} label={`Chọn ${issue.key}`} />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <a
            href={`${jiraBase}/browse/${issue.key}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 font-mono text-small font-semibold text-accent-ink hover:underline"
          >
            {issue.key}
          </a>
          <span className={'min-w-0 flex-1 truncate text-body ' + (picked ? 'text-ink' : '')} title={issue.summary}>
            {plainTitle(issue.summary) || issue.summary}
          </span>
          <Status name={issue.statusName} />
          {isBug ? (
            <span className="w-[86px] shrink-0 text-right text-micro text-ink-3">
              {isFixed(issue.statusName) ? 'đã fix' : isDevDone(issue.statusName) ? 'chờ test' : ''}
            </span>
          ) : (
            <Bar percent={p.percent} />
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-micro text-ink-3">
          <select
            value={phase}
            onChange={(e) => onPhase(e.target.value as Phase)}
            title={overridden ? 'Đã sửa tay' : 'Đoán từ tiêu đề / loại issue — đổi nếu sai'}
            className={
              'rounded-md border bg-ground px-1 py-0.5 text-micro ' +
              (overridden ? 'border-accent text-accent-ink' : 'border-line text-ink-2')
            }
            aria-label="Loại việc"
          >
            {PHASES.map((ph) => (
              <option key={ph.id} value={ph.id}>
                {ph.label}
              </option>
            ))}
          </select>
          <span title="Người làm">{issue.assignee ?? 'chưa giao'}</span>
          {p.subtasksTotal > 0 && !isBug && (
            <span title="Subtask xong / tổng. Đang làm tính 50%, đã commit code tính 75%.">
              subtask {p.subtasksDone}/{p.subtasksTotal} xong
              {p.subtasksActive > 0 && ` · ${p.subtasksActive} đang làm`}
            </span>
          )}
          {info.platforms.length > 0 ? (
            <span>{info.platforms.join(' · ')}</span>
          ) : (
            <span className="badge bg-warn-soft text-warn" title="Tiêu đề và epic đều không ghi nền tảng">
              ? nền tảng
            </span>
          )}
          {info.isNew && <span className="badge bg-blue-soft text-blue">mới</span>}
          {info.daily && info.daily.length > 0 && (
            <span
              className="badge bg-note-soft text-note"
              title={info.daily
                .map((d) => `${[d.person, d.when === 'yesterday' ? '(hôm qua)' : d.when === 'today' ? '(hôm nay)' : ''].filter(Boolean).join(' ')}: ${d.line}`)
                .join('\n')}
            >
              daily · {[...new Set(info.daily.map((d) => d.person).filter(Boolean))].join(', ') || info.daily.length}
            </span>
          )}
          {issue.clones.length > 0 && (
            <span className="badge bg-surface-2 text-ink-3" title={`Clone của ${issue.clones.join(', ')} — bản gốc bị ẩn`}>
              clone
            </span>
          )}
          {showSprintFlag && !issue.inSprint && (
            <span className="badge bg-surface-2 text-ink-3" title={issue.sprints.length ? issue.sprints.join(', ') : 'Chưa vào sprint nào'}>
              {issue.sprints.length ? 'sprint khác' : 'backlog'}
            </span>
          )}
        </div>
      </div>
    </li>
  )
}
