'use client'

import { useMemo, useRef, useState, useTransition } from 'react'

import { logWorkAction, undoWorklogAction } from '@/app/actions'
import { createIssueAction } from '@/app/new/actions'
import { composeSubtaskTitle, defaultSubtaskDates, subtaskPointsFrom } from '@/lib/subtask-from-parent'

import { Spinner } from '../spinner'
import { suggestionFrom, useComposeContext } from './compose-context'
import { CreateIssueButton } from './create-issue'
import { useNav } from './navigation'
import { PickAndLog } from './pick-and-log'

/**
 * Creates a subtask from one line under its parent, then offers to log on it.
 *
 * A short title and Enter. The full dialog — with "Tạo nhanh từ task cha",
 * Gemini, description, DoD and templates — stays one click away for a task
 * worth describing.
 *
 * The team and sprint prefixes are put in front, the platform prefixes the
 * parent already carries (e.g. `[Web]`) start picked, and the dates are filled
 * but shown, so nothing is written to Jira unseen.
 */
export function QuickSubtask({
  parentKey,
  date,
  isToday,
  presets,
  sprintEnd,
}: {
  parentKey: string
  /** The day being logged on the board — the default start date. */
  date: string
  isToday: boolean
  presets: number[]
  /** End of the sprint on screen, the fallback due date. */
  sprintEnd: string | null
}) {
  const { navigate, refresh } = useNav()
  const { ctx, error, load } = useComposeContext(parentKey)

  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<string[] | null>(null)
  const [withSprint, setWithSprint] = useState(true)
  const [points, setPoints] = useState<number | null>(null)
  const [startDate, setStartDate] = useState(date)
  const [dueDate, setDueDate] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null)
  const [created, setCreated] = useState<{ key: string; id: string } | null>(null)
  const [logged, setLogged] = useState<{ ids: string[]; message: string } | null>(null)
  const [creating, startCreating] = useTransition()
  const [logging, startLogging] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestion = ctx ? suggestionFrom(ctx) : null
  // Until touched, the chips, points and due date follow the parent.
  const chips = picked ?? suggestion?.picked ?? []
  const sp = points ?? (ctx ? subtaskPointsFrom(ctx.parent.storyPoints, 1) : 1)
  const due =
    dueDate ?? (ctx ? defaultSubtaskDates(startDate, ctx.parent.dueDate, ctx.parentSprintEnd ?? sprintEnd).dueDate : '')
  const sprintPx = withSprint ? (suggestion?.sprintCode ?? null) : null

  const fullTitle = useMemo(() => {
    let t = title.trim()
    // Typed prefixes that the form already adds would otherwise appear twice.
    for (const px of [ctx?.team.prefix, suggestion?.sprintCode, ...chips]) {
      if (px && t.toLowerCase().startsWith(px.toLowerCase())) t = t.slice(px.length).trim()
    }
    return composeSubtaskTitle([ctx?.team.prefix, sprintPx, ...chips], t)
  }, [title, ctx, suggestion, chips, sprintPx])

  const datesOk =
    !ctx ||
    ((!ctx.supports.startDate || Boolean(startDate)) &&
      (!ctx.supports.dueDate || Boolean(due)) &&
      !(startDate && due && due < startDate))
  const canCreate = Boolean(fullTitle && ctx?.issueTypeId && datesOk && !creating)

  function create() {
    if (!canCreate || !ctx?.issueTypeId) return
    setNote(null)
    setLogged(null)
    startCreating(async () => {
      const res = await createIssueAction({
        issueTypeId: ctx.issueTypeId!,
        summary: fullTitle,
        description: '',
        dod: '',
        parentKey,
        sprintId: null,
        storyPoints: sp,
        assignToMe: true,
        startDate: ctx.supports.startDate ? startDate : undefined,
        dueDate: ctx.supports.dueDate ? due : undefined,
      })
      if (res.ok && res.key) {
        setCreated({ key: res.key, id: res.id ?? '' })
        setNote(res.warning ? { ok: true, message: res.warning } : null)
        setTitle('')
        // Same as the dialog: carry the new id so the board query includes it
        // before Jira's search index has caught up.
        if (res.id) {
          const params = new URLSearchParams(window.location.search)
          params.set('reconcile', res.id)
          navigate(`${window.location.pathname}?${params}`)
        } else {
          refresh()
        }
      } else {
        setNote(res)
      }
    })
  }

  function logOn(key: string, hours: number) {
    startLogging(async () => {
      const res = await logWorkAction({ issueKey: key, hours, date })
      if (res.ok) setLogged({ ids: res.worklogIds ?? [], message: res.message })
      else setNote(res)
      if (res.ok || res.partial) refresh()
    })
  }

  function undoLog(key: string) {
    if (!logged?.ids.length) return
    const ids = logged.ids
    startLogging(async () => {
      const res = await undoWorklogAction({ issueKey: key, worklogIds: ids })
      setLogged(null)
      setNote(res)
      if (res.ok || res.partial) refresh()
    })
  }

  const active = Boolean(title.trim())

  return (
    <div className="relative border-t border-line">
      {/* The tree's last branch: the rail from the rows above ends here. */}
      <span aria-hidden className="pointer-events-none absolute left-6 top-0 h-[24px] w-px bg-line-strong" />
      <span aria-hidden className="pointer-events-none absolute left-6 top-[24px] h-px w-2.5 bg-line-strong" />

      <form
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
        className="flex items-center gap-2 py-2 pl-[34px] pr-4"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md border border-dashed border-line-strong text-ink-3">
          +
        </span>
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setCreated(null)
            setLogged(null)
          }}
          onFocus={() => load().catch(() => {})}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setTitle('')
              e.currentTarget.blur()
            }
          }}
          placeholder={`Thêm task con cho ${parentKey}`}
          aria-label={`Tên task con mới cho ${parentKey}`}
          className="h-8 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-body placeholder:text-ink-3 hover:border-line focus:bg-surface"
        />
        {active && (
          <button
            type="submit"
            disabled={!canCreate}
            className="h-8 shrink-0 rounded-lg bg-accent px-3 text-small font-semibold text-on-accent shadow-card hover:bg-accent-2 disabled:opacity-50"
          >
            {creating ? <Spinner className="size-3" /> : 'Tạo'}
          </button>
        )}
        <CreateIssueButton
          parentKey={parentKey}
          className="h-8 shrink-0 rounded-lg px-2 text-caption font-medium text-ink-3 hover:bg-surface-2 hover:text-accent-ink"
        >
          <span className="hidden sm:inline">Form đầy đủ </span>↗
        </CreateIssueButton>
      </form>

      {active && (
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 pb-3 pl-[74px] pr-4 text-small"
        >
          {error ? (
            <span className="text-crit">{error}</span>
          ) : !ctx ? (
            <span className="inline-flex items-center gap-1.5 text-ink-3">
              <Spinner className="size-3" /> Đang lấy cấu hình…
            </span>
          ) : (
            <>
              <span className="min-w-0 basis-full truncate font-mono text-caption text-ink-3" title={fullTitle}>
                → {fullTitle}
              </span>

              <span className="flex flex-wrap items-center gap-1">
                {suggestion?.sprintCode && (
                  <Chip on={withSprint} onClick={() => setWithSprint((v) => !v)} title="Tiền tố sprint — bấm để bỏ">
                    {suggestion.sprintCode}
                  </Chip>
                )}
                {ctx.prefixes.map((p) => {
                  const on = chips.includes(p)
                  return (
                    <Chip
                      key={p}
                      on={on}
                      onClick={() => setPicked(on ? chips.filter((x) => x !== p) : [...chips, p])}
                    >
                      {p}
                    </Chip>
                  )
                })}
              </span>

              <span className="flex items-center gap-1">
                <span className="text-caption text-ink-3">SP</span>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPoints(n)}
                    className={
                      'size-7 rounded-md border font-mono text-caption font-semibold ' +
                      (sp === n
                        ? 'border-accent bg-accent-soft text-accent-ink'
                        : 'border-line text-ink-3 hover:border-line-strong')
                    }
                  >
                    {n}
                  </button>
                ))}
              </span>

              {(ctx.supports.startDate || ctx.supports.dueDate) && (
                <span className="flex items-center gap-1 text-caption text-ink-3">
                  {ctx.supports.startDate && (
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      aria-label="Start date"
                      className="h-7 rounded-md border border-line bg-surface px-1.5 font-mono text-caption text-ink-2"
                    />
                  )}
                  {ctx.supports.startDate && ctx.supports.dueDate && '→'}
                  {ctx.supports.dueDate && (
                    <input
                      type="date"
                      value={due}
                      min={startDate || undefined}
                      onChange={(e) => setDueDate(e.target.value)}
                      aria-label="Due date"
                      className="h-7 rounded-md border border-line bg-surface px-1.5 font-mono text-caption text-ink-2"
                    />
                  )}
                </span>
              )}
              {!datesOk && <span className="text-warn">Kiểm tra lại ngày</span>}
            </>
          )}
        </div>
      )}

      {(created || note) && (
        <div className="flex flex-wrap items-center gap-2 pb-3 pl-[74px] pr-4 text-small">
          {created && !logged && (
            <>
              <span className="text-good">
                ✓ Đã tạo <b className="font-mono">{created.key}</b> — log ngay:
              </span>
              <PickAndLog
                hours={presets.slice(0, 4)}
                isToday={isToday}
                pending={logging}
                onLog={(h) => logOn(created.key, h)}
              />
            </>
          )}
          {created && logged && (
            <span className="text-good">
              {logged.message}
              {logged.ids.length > 0 && (
                <button
                  type="button"
                  onClick={() => undoLog(created.key)}
                  disabled={logging}
                  className="ml-2 rounded-md border border-line-strong bg-surface px-2 py-0.5 text-caption font-semibold text-ink-2 hover:bg-surface-2"
                >
                  ↶ Hoàn tác
                </button>
              )}
            </span>
          )}
          {note && <span className={note.ok ? 'text-warn' : 'text-crit'}>{note.message}</span>}
        </div>
      )}
    </div>
  )
}

function Chip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={
        'rounded-md border px-1.5 py-0.5 font-mono text-caption ' +
        (on
          ? 'border-accent bg-accent-soft text-accent-ink'
          : 'border-line text-ink-3 hover:border-line-strong hover:text-ink-2')
      }
    >
      {children}
    </button>
  )
}
