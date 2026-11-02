'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { type ReportIssue, renderReport } from '@/lib/report'
import { statusStyle } from '@/lib/status-style'
import { formatDateVi, formatDuration } from '@/lib/time'

import { NavSpinner, useNav } from '../board/navigation'
import { refreshTodayCandidatesAction } from './actions'

export interface TodayCandidate {
  key: string
  summary: string
  statusName: string
}

/** What the user ticked for one report day, kept so a reload does not lose it. */
interface Picks {
  /** Previous-day issues left out of the report. Stored as exclusions, so a log added later shows up ticked. */
  skip: string[]
  today: string[]
  off: boolean
}

/**
 * The report text once the user has typed into it, with the generated text it
 * started from. Absent while the box still follows the ticks.
 */
interface Edit {
  text: string
  /** The generated report at the moment editing began — what `stale` compares against. */
  baseline: string
}

/**
 * The report, assembled from what the user ticks.
 *
 * Rendered here rather than on the server so each tick shows up in the text at
 * once — a round trip to Jira per checkbox would make picking six tasks take
 * half a minute.
 */
export function ReportOutput({
  template,
  date,
  prevDate,
  prevDayOff,
  displayName,
  sprintName,
  sprintId,
  previousIssues,
  todayCandidates: initialCandidates,
  templates,
  templateId,
  showKey,
}: {
  template: string
  /** The day the report is written for. */
  date: string
  /** The last working day before it — what "Previous day" covers. */
  prevDate: string
  /** prevDate is marked as leave in the app. */
  prevDayOff: boolean
  displayName?: string
  sprintName?: string
  sprintId: number | null
  previousIssues: ReportIssue[]
  todayCandidates: TodayCandidate[]
  templates: Array<{ id: number; name: string; isDefault: boolean }>
  templateId: number
  showKey: boolean
}) {
  const params = useSearchParams()
  const { navigate, pending } = useNav()
  const [copied, setCopied] = useState(false)

  const storageKey = `report-picks:${date}`
  const [picks, setPicks] = useState<Picks>(() => ({
    skip: [],
    // Nothing ticked: the user picks what goes under "Today" themselves.
    today: [],
    // Nothing logged on a working day reads as a day off — the usual reason.
    off: true,
  }))

  // Shown at once from the render, then re-read live: the render may be an
  // hour old out of the client cache, missing a task assigned since.
  const [todayCandidates, setTodayCandidates] = useState(initialCandidates)
  const [syncing, setSyncing] = useState(true)
  useEffect(() => {
    let live = true
    setTodayCandidates(initialCandidates)
    setSyncing(true)
    refreshTodayCandidatesAction(sprintId).then((fresh) => {
      if (!live) return
      if (fresh) setTodayCandidates(fresh)
      setSyncing(false)
    })
    return () => {
      live = false
    }
  }, [sprintId, initialCandidates])

  // Restored after mount: the server cannot read this browser's storage.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setPicks(JSON.parse(saved) as Picks)
    } catch {
      // Storage blocked or unreadable — the defaults stand.
    }
  }, [storageKey])

  // The box follows the ticks until the first keystroke; from then on the
  // user's text is kept, per report day, so a reload does not lose it.
  const editKey = `report-text:${date}`
  const [edit, setEdit] = useState<Edit | null>(null)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(editKey)
      setEdit(saved ? (JSON.parse(saved) as Edit) : null)
    } catch {
      setEdit(null)
    }
  }, [editKey])

  function saveEdit(next: Edit | null) {
    setEdit(next)
    try {
      if (next) localStorage.setItem(editKey, JSON.stringify(next))
      else localStorage.removeItem(editKey)
    } catch {
      // Not remembered across reloads, but the edit still stands on screen.
    }
  }

  function update(next: Picks) {
    setPicks(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Not remembered across reloads, but the report still works.
    }
  }

  const skip = new Set(picks.skip)
  const today = new Set(picks.today)
  const selectedPrev = previousIssues.filter((i) => !skip.has(i.key))
  const selectedToday = todayCandidates.filter((t) => today.has(t.key))
  const noPrevLogs = previousIssues.length === 0

  const body = renderReport(template, {
    date: prevDate,
    reportDate: date,
    issues: selectedPrev,
    totalSeconds: selectedPrev.reduce((n, i) => n + i.seconds, 0),
    previousOff: noPrevLogs && picks.off,
    displayName,
    sprintName,
    showKey,
    todayIssues: selectedToday.map((t) => ({ key: t.key, summary: t.summary, seconds: 0 })),
  })

  const shown = edit?.text ?? body
  // Ticks, template or the key toggle moved on since editing began: the edited
  // text no longer says what the picks say, and silently keeping it would be
  // copying a report that misses the task just ticked.
  const stale = edit !== null && edit.baseline !== body

  // Grown to fit after every change, so the whole report reads at once the way
  // the read-only block did. A line count is not enough: long task titles wrap.
  const box = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [shown])

  function rebuild() {
    if (edit && edit.text !== edit.baseline && !confirm('Dựng lại sẽ thay bản đang sửa bằng bản tự động. Tiếp tục?')) return
    saveEdit(null)
  }

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

  function togglePrev(key: string) {
    const next = new Set(skip)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    update({ ...picks, skip: [...next] })
  }

  function toggleToday(key: string) {
    const next = new Set(today)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    // Kept in the candidates' own order, so the report lists them the same way.
    update({ ...picks, today: todayCandidates.filter((t) => next.has(t.key)).map((t) => t.key) })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(shown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard needs a secure context; selecting the text is the fallback.
      const box = document.getElementById('report-body') as HTMLTextAreaElement | null
      box?.select()
    }
  }

  return (
    <section className="card p-5">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="eyebrow text-ink-2">Nội dung report</div>
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

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <PickGroup
            title="Previous day"
            sub={formatDateVi(prevDate)}
            count={noPrevLogs ? undefined : `${selectedPrev.length}/${previousIssues.length}`}
            onAll={
              noPrevLogs
                ? undefined
                : (on) => update({ ...picks, skip: on ? [] : previousIssues.map((i) => i.key) })
            }
            allOn={selectedPrev.length === previousIssues.length}
          >
            {noPrevLogs ? (
              <>
                <PickRow checked={picks.off} onToggle={() => update({ ...picks, off: !picks.off })}>
                  <span className="font-medium">Off</span>
                </PickRow>
                <p className="px-2 pt-1 text-small leading-relaxed text-ink-3">
                  {prevDayOff
                    ? 'Ngày này đã đánh dấu nghỉ.'
                    : 'Không có worklog nào ngày này.'}{' '}
                  Bỏ chọn nếu không muốn ghi Off.
                </p>
              </>
            ) : (
              previousIssues.map((i) => (
                <PickRow key={i.key} checked={!skip.has(i.key)} onToggle={() => togglePrev(i.key)}>
                  <IssueLine issueKey={i.key} summary={i.summary} />
                  <span className="mt-px shrink-0 font-mono text-caption text-ink-3">{formatDuration(i.seconds)}</span>
                </PickRow>
              ))
            )}
          </PickGroup>

          <PickGroup
            title="Today"
            sub={syncing ? 'giao cho bạn · chưa Done · đang cập nhật…' : 'giao cho bạn · chưa Done'}
            count={todayCandidates.length ? `${selectedToday.length}/${todayCandidates.length}` : undefined}
            onAll={
              todayCandidates.length
                ? (on) => update({ ...picks, today: on ? todayCandidates.map((t) => t.key) : [] })
                : undefined
            }
            allOn={selectedToday.length === todayCandidates.length}
          >
            {todayCandidates.length ? (
              <div className="-mr-1 max-h-[360px] overflow-y-auto pr-1">
                {todayCandidates.map((t) => (
                  <PickRow key={t.key} checked={today.has(t.key)} onToggle={() => toggleToday(t.key)}>
                    <IssueLine issueKey={t.key} summary={t.summary} />
                    <span
                      title={t.statusName}
                      className={
                        'mt-px max-w-[110px] shrink-0 truncate rounded-[5px] px-[6px] py-[2px] status-text ' +
                        statusStyle(t.statusName)
                      }
                    >
                      {t.statusName}
                    </span>
                  </PickRow>
                ))}
              </div>
            ) : (
              <p className="px-2 text-small text-ink-3">Không có task nào đang mở trong sprint này.</p>
            )}
          </PickGroup>
        </div>

        <div className="flex flex-col gap-2 xl:sticky xl:top-5">
          <div className="flex items-center gap-2">
            <span
              className={'badge ' + (edit ? 'bg-warn-soft text-warn' : 'bg-good-soft text-good')}
              title={
                edit
                  ? 'Đã sửa — tick thêm task sẽ không tự đổi nội dung này'
                  : 'Nội dung tự cập nhật khi bạn tick task; gõ vào để sửa'
              }
            >
              {edit ? 'đã sửa tay' : 'tự cập nhật'}
            </span>
            {edit && (
              <button
                type="button"
                onClick={rebuild}
                className="text-small font-medium text-accent-ink hover:underline"
              >
                Dựng lại
              </button>
            )}
          </div>

          <textarea
            id="report-body"
            ref={box}
            value={shown}
            onChange={(e) => saveEdit({ text: e.target.value, baseline: edit?.baseline ?? body })}
            rows={8}
            spellCheck={false}
            aria-label="Nội dung report"
            className="w-full resize-none overflow-hidden rounded-xl border border-line bg-ground px-4 py-3.5 font-mono text-small leading-[1.75] focus:border-accent focus:outline-none"
          />

          {stale && (
            <div className="rounded-md bg-warn-soft px-3 py-1.5 text-small text-warn">
              Lựa chọn đã đổi so với bản đang sửa —{' '}
              <button type="button" onClick={rebuild} className="font-semibold underline underline-offset-2">
                dựng lại
              </button>{' '}
              để cập nhật, hoặc tự sửa tiếp.
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function PickGroup({
  title,
  sub,
  count,
  onAll,
  allOn,
  children,
}: {
  title: string
  sub: string
  count?: string
  onAll?: (on: boolean) => void
  allOn: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-line p-1.5">
      <div className="flex items-baseline gap-2 px-2 pb-1.5 pt-1">
        <b className="text-body font-semibold">{title}</b>
        <span className="min-w-0 flex-1 truncate text-small text-ink-3">{sub}</span>
        {count && <span className="font-mono text-caption text-ink-3">{count}</span>}
        {onAll && (
          <button
            type="button"
            onClick={() => onAll(!allOn)}
            className="text-small font-medium text-accent-ink hover:underline"
          >
            {allOn ? 'Bỏ hết' : 'Chọn hết'}
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

function PickRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <label
      className={
        'flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-body transition-colors hover:bg-surface-2 ' +
        (checked ? '' : 'text-ink-3')
      }
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-[3px] shrink-0 accent-accent" />
      {children}
    </label>
  )
}

function IssueLine({ issueKey, summary }: { issueKey: string; summary: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="line-clamp-2 break-words leading-[19px]" title={summary}>
        <span className="mr-1.5 font-mono text-caption text-ink-3">{issueKey}</span>
        {summary}
      </span>
    </span>
  )
}
