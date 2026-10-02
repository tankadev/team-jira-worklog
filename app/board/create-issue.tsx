'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'

import { logWorkAction, undoWorklogAction } from '@/app/actions'
import { createIssueAction, generateAction } from '@/app/new/actions'
import { sprintPrefix, withoutSprintPrefix } from '@/lib/sprint-name'
import { defaultSubtaskDates, subtaskFromParent, subtaskPointsFrom } from '@/lib/subtask-from-parent'
import { todayIn } from '@/lib/time'

import { DateInput } from '../date-input'
import { Spinner, Working } from '../spinner'
import { useNav } from './navigation'
import { PickAndLog } from './pick-and-log'

interface Template {
  id: number
  name: string
  title: string
  description: string
  dod: string
  prefixes: string[]
  storyPoints: number | null
}

interface ComposeContext {
  mode: 'subtask' | 'task'
  issueTypeId: string | null
  issueTypeName: string | null
  sprints: Array<{
    id: number
    name: string
    current: boolean
    start: string | null
    end: string | null
  }>
  currentSprintId: number | null
  parentSprintEnd: string | null
  /** Mandatory label and summary prefix for this team; both may be null. */
  team: { label: string | null; prefix: string | null }
  /** Which date fields this project actually has on its create screen. */
  supports: { startDate: boolean; dueDate: boolean }
  prefixes: string[]
  sprintPrefixPattern: string
  budgets: Record<number, string>
  templates: Template[]
  parent: {
    key: string
    summary: string
    typeName: string
    epicKey: string | null
    epicSummary: string | null
    sprintName: string | null
    startDate: string | null
    dueDate: string | null
    storyPoints: number | null
    /** The parent's description and DoD as plain text, for "Tạo nhanh từ task cha". */
    description: string
    dod: string
  }
}

export function CreateIssueButton({
  parentKey,
  mode = 'subtask',
  boardSprintId = null,
  className,
  children,
}: {
  parentKey: string
  /** 'subtask' hangs off a Task, 'task' hangs off an Epic. */
  mode?: 'subtask' | 'task'
  /**
   * Sprint the board is filtered to. A task created from an epic belongs where
   * the user is looking, not in whichever sprint happens to be running.
   */
  boardSprintId?: number | null
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {open && (
        <CreateIssueModal
          parentKey={parentKey}
          mode={mode}
          boardSprintId={boardSprintId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/**
 * Creates an issue without leaving the board.
 *
 * Going to /new and back cost two full page loads against Jira and lost the
 * place on the board each time. Here the modal opens instantly and the board
 * behind it refreshes as soon as the issue exists.
 *
 * It stays open after a successful create on purpose: breaking a parent into
 * several children is one sitting, not several.
 *
 * Two columns on a wide screen. The usual path is describe → generate →
 * edit, which fills three long text fields — stacked in one column they would
 * not fit without scrolling past the controls that decide what gets created.
 */
function CreateIssueModal({
  parentKey,
  mode,
  boardSprintId,
  onClose,
}: {
  parentKey: string
  mode: 'subtask' | 'task'
  boardSprintId: number | null
  onClose: () => void
}) {
  const { refresh, navigate } = useNav()

  const [ctx, setCtx] = useState<ComposeContext | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [idea, setIdea] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dod, setDod] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [points, setPoints] = useState<number | null>(2)
  const [pointsPicked, setPointsPicked] = useState(false)
  const [sprintId, setSprintId] = useState<number | null>(null)
  const [templateId, setTemplateId] = useState<number | undefined>()
  // Left empty on purpose. The team fills these per task, and pre-filling
  // today's date would let a wrong-but-plausible pair sail through unread.
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')

  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null)
  const [created, setCreated] = useState<Array<{ key: string; url: string; id: string }>>([])
  /**
   * The issue created by the last click, or null once the user starts the next
   * one. Drives the prominent success banner so a finished create is impossible
   * to miss — the reason a second, accidental click used to slip through.
   */
  const [justCreated, setJustCreated] = useState<{
    key: string
    url: string
    warning?: string
  } | null>(null)
  const ideaRef = useRef<HTMLTextAreaElement>(null)
  const [generating, startGenerating] = useTransition()
  const [creating, startCreating] = useTransition()

  useEffect(() => {
    let alive = true
    fetch(`/api/compose?parent=${encodeURIComponent(parentKey)}&mode=${mode}`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body?.error ?? 'Không tải được dữ liệu')
        return body as ComposeContext
      })
      .then((c) => {
        if (!alive) return
        setCtx(c)
        setSprintId(boardSprintId ?? c.currentSprintId)
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      alive = false
    }
  }, [parentKey, mode, boardSprintId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Land the cursor back in the first field after a create, so the reset form
  // reads as "ready for the next one" instead of an unchanged, already-submitted
  // one. New object each time means a run of creates re-focuses every time.
  useEffect(() => {
    if (justCreated) ideaRef.current?.focus()
  }, [justCreated])

  /**
   * The team prefix always leads, ahead of every chip the user picks.
   *
   * It is not offered as a chip because it is not a choice: `[CTALK]` is what
   * marks the task as this team's, and `createIssue` puts it back anyway. Making
   * it a chip would just invite someone to turn it off and wonder why it
   * reappeared.
   */
  const teamPrefix = ctx?.team.prefix ?? null

  const fullTitle = useMemo(() => {
    const px = [...(teamPrefix ? [teamPrefix] : []), ...picked].join('')
    return px ? `${px} ${title.trim()}`.trim() : title.trim()
  }, [teamPrefix, picked, title])

  const isTask = mode === 'task'

  /**
   * A subtask inherits the parent's sprint; a task goes to the one chosen here.
   * Either way it is that sprint's number in the prefix — using today's running
   * sprint mislabels anything created while reviewing an earlier one.
   */
  const targetSprint = isTask ? (ctx?.sprints.find((s) => s.id === sprintId) ?? null) : null
  const targetSprintName = isTask ? (targetSprint?.name ?? null) : (ctx?.parent.sprintName ?? null)
  // A subtask has no sprint of its own; its horizon is the parent's sprint.
  const targetSprintEnd = isTask ? (targetSprint?.end ?? null) : (ctx?.parentSprintEnd ?? null)

  const currentPrefix = ctx ? sprintPrefix(targetSprintName, ctx.sprintPrefixPattern) : null
  const allPrefixes = ctx ? [...(currentPrefix ? [currentPrefix] : []), ...ctx.prefixes] : []

  // Swap the sprint prefix whenever the target sprint changes, leaving every
  // other chip and its position untouched.
  useEffect(() => {
    if (!ctx) return
    setPicked((list) => {
      // Matched against the configured pattern, not a fixed `[spt …]` shape — a
      // team writing `[SPT-69]` would otherwise keep the stale chip and end up
      // with two sprint numbers in one title.
      const withoutSprint = withoutSprintPrefix(list, ctx.sprintPrefixPattern)
      return currentPrefix ? [currentPrefix, ...withoutSprint] : withoutSprint
    })
  }, [ctx, currentPrefix])


  function applyTemplate(t: Template) {
    setJustCreated(null)
    setTitle(t.title)
    setDescription(t.description)
    setDod(t.dod)
    if (t.storyPoints) {
      setPoints(t.storyPoints)
      setPointsPicked(true)
    }
    setPicked(currentPrefix ? [currentPrefix, ...t.prefixes] : t.prefixes)
    setTemplateId(t.id)
    setNote({ ok: true, message: `Đã áp mẫu "${t.name}"` })
  }

  function generate() {
    setJustCreated(null)
    startGenerating(async () => {
      const res = await generateAction(idea, ctx?.parent.summary)
      setNote(res)
      if (res.ok && res.data) {
        setTitle(res.data.title)
        setDescription(res.data.description)
        setDod(res.data.dod)
        // Never overwrite a deliberate pick.
        if (res.data.storyPoints && !pointsPicked) setPoints(res.data.storyPoints)
      }
    })
  }

  function create() {
    if (!ctx?.issueTypeId) return
    setLogged(null)
    startCreating(async () => {
      const res = await createIssueAction({
        templateId,
        issueTypeId: ctx.issueTypeId!,
        summary: fullTitle,
        description,
        dod,
        parentKey,
        // A subtask never carries its own sprint; Jira derives it from the parent.
        sprintId: isTask ? sprintId : null,
        // A parent's estimate is the sum of children that do not exist yet.
        storyPoints: isTask ? null : points,
        assignToMe: true,
        startDate,
        dueDate,
      })
      if (res.ok && res.key && res.url) {
        // The banner carries success now; a duplicate green note in the footer
        // would just compete with it.
        setNote(null)
        setJustCreated({ key: res.key, url: res.url, warning: res.warning })
        const next = [...created, { key: res.key, url: res.url, id: res.id ?? '' }]
        setCreated(next)
        setTitle('')
        setDescription('')
        setDod('')
        setIdea('')
        setTemplateId(undefined)
        // Dates are per task, like the title — carrying them over would silently
        // date the next subtask to the last one's schedule.
        setStartDate('')
        setDueDate('')

        // Re-render carrying the new ids so the board query forces Jira to
        // include them; a plain refresh would race the search index.
        const ids = next.map((c) => c.id).filter(Boolean)
        if (ids.length) {
          const params = new URLSearchParams(window.location.search)
          params.set('reconcile', ids.join(','))
          navigate(`${window.location.pathname}?${params}`)
        } else {
          refresh()
        }
      } else {
        setNote(res)
      }
    })
  }

  /** The day the board is logging into — where "Log ngay" lands. */
  const logDate = (() => {
    const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('date') : null
    return fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) ? fromUrl : new Date().toLocaleDateString('sv')
  })()
  const [logged, setLogged] = useState<{ ids: string[]; message: string } | null>(null)
  const [logging, startLogging] = useTransition()

  const [fromParentBusy, startFromParent] = useTransition()

  /**
   * "Tạo nhanh từ task cha": fills the form from the parent so there is
   * nothing to type — only to read, adjust and create. Nothing is written to
   * Jira here; the create stays the user's own click.
   *
   * The title is the parent's own (its tags taken apart into chips); Gemini
   * drafts the description and DoD from the parent's title and description,
   * the same way "✦ Generate" drafts from an idea. Without it
   * (no key, quota, outage) the parent's text is copied as is, so the button
   * never leaves the form empty.
   */
  function generateFromParent() {
    if (!ctx || isTask) return
    const parts = subtaskFromParent(ctx.parent.summary, {
      prefixes: ctx.prefixes,
      teamPrefix: ctx.team.prefix,
      sprintPattern: ctx.sprintPrefixPattern,
    })
    setJustCreated(null)
    setTemplateId(undefined)
    setIdea(parts.title)
    setPicked([...(currentPrefix ? [currentPrefix] : []), ...parts.picked])
    const parentPoints = subtaskPointsFrom(ctx.parent.storyPoints, 0)
    if (parentPoints) {
      setPoints(parentPoints)
      setPointsPicked(true)
    }
    const dates = defaultSubtaskDates(logDate, ctx.parent.dueDate, ctx.parentSprintEnd)
    if (ctx.supports.startDate && !startDate) setStartDate(dates.startDate)
    if (ctx.supports.dueDate && !dueDate) setDueDate(dates.dueDate)

    startFromParent(async () => {
      const source = [parts.title, ctx.parent.description, ctx.parent.dod].filter(Boolean).join('\n\n')
      const res = await generateAction(source, ctx.parent.summary)
      // The title stays the parent's own words, so the subtask is recognisably
      // the same piece of work on the board and in Jira; Gemini drafts the rest.
      setTitle(parts.title)
      if (res.ok && res.data) {
        setDescription(res.data.description)
        setDod(res.data.dod)
        if (res.data.storyPoints && !parentPoints && !pointsPicked) setPoints(res.data.storyPoints)
        setNote({ ok: true, message: `Đã điền theo ${parentKey} — xem lại rồi bấm Tạo trên Jira` })
      } else {
        setDescription(ctx.parent.description)
        setDod(ctx.parent.dod)
        setNote({
          ok: false,
          message: `Gemini không sinh được (${res.message}) — đã chép nguyên văn từ ${parentKey}, sửa lại nếu cần`,
        })
      }
    })
  }

  function logNow(key: string, hours: number) {
    startLogging(async () => {
      const res = await logWorkAction({ issueKey: key, hours, date: logDate })
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

  // Requires a real title, not just a lingering prefix chip: after a create the
  // title clears but the sprint prefix stays, so keying `canCreate` off the
  // combined string would leave the button armed to fire a prefix-only issue on
  // an accidental second click.
  // Only the dates this project actually supports are required, and the panel
  // hides entirely on a project that has neither.
  const wantsDates = Boolean(ctx?.supports.startDate || ctx?.supports.dueDate)
  const datesOk =
    !ctx ||
    ((!ctx.supports.startDate || Boolean(startDate)) &&
      (!ctx.supports.dueDate || Boolean(dueDate)) &&
      !(startDate && dueDate && dueDate < startDate))
  const canCreate = Boolean(title.trim() && ctx?.issueTypeId && datesOk && !creating)

  // Rendered through the body, not inline: the button lives inside the board's
  // NavDimmer, so a plain child would fade to opacity-40 the moment a successful
  // create kicks off the board refresh. The portal keeps the dialog crisp and
  // clickable while the board behind it reloads.
  return createPortal(
    <div
      // Deliberately no backdrop-click-to-close: a create form holds several
      // minutes of typing, and a stray click outside must not throw it away.
      // Close is the ×, the "Đóng" button, or Escape.
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-auto bg-black/55 backdrop-blur-[3px] p-4 sm:p-8"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tạo ${isTask ? 'task' : 'task con'} dưới ${parentKey}`}
        className="w-full max-w-[980px] rounded-2xl border border-line-strong bg-surface shadow-pop"
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <span className="rounded-[5px] bg-surface-2 px-1.5 py-0.5 chip-text text-ink-3">
            {isTask ? 'Task' : 'Task con'}
          </span>
          <h3 className="text-emph font-semibold">
            Tạo dưới <span className="font-mono text-accent-ink">{parentKey}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="ml-auto grid size-7 place-items-center rounded-md text-xl leading-none text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="max-h-[74vh] overflow-auto px-4 py-4">
          {loadError && <p className="text-body text-crit">{loadError}</p>}

          {!ctx && !loadError && (
            <p className="flex items-center gap-2 text-body text-ink-3">
              <Spinner /> Đang tải…
            </p>
          )}

          {justCreated && (
            <div
              role="status"
              aria-live="polite"
              className="mb-4 flex items-center gap-2.5 rounded-lg border border-good/50 bg-good-soft px-3 py-2.5"
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-good text-body font-bold text-white">
                ✓
              </span>
              <div className="text-body leading-snug text-ink">
                Đã tạo{' '}
                <a
                  href={justCreated.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono font-semibold text-good underline-offset-2 hover:underline"
                >
                  {justCreated.key}
                </a>{' '}
                thành công. Form đã xoá trắng, sẵn sàng cho task tiếp theo.
                {/* The issue is real, so the banner stays green — but a field
                    that did not land has to be said out loud, not left for the
                    user to spot as an empty chip on the board later. */}
                {justCreated.warning && (
                  <span className="mt-1 block text-warn">⚠ {justCreated.warning}</span>
                )}
                {!isTask && (
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    {logged ? (
                      <>
                        <span className="text-good">{logged.message}</span>
                        {logged.ids.length > 0 && (
                          <button
                            type="button"
                            onClick={() => undoLog(justCreated.key)}
                            disabled={logging}
                            className="rounded-md border border-line-strong bg-surface px-2 py-0.5 text-caption font-semibold text-ink-2 hover:bg-surface-2"
                          >
                            ↶ Hoàn tác
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-small text-ink-2">Log ngay vào {logDate.slice(8)}/{logDate.slice(5, 7)}:</span>
                        <PickAndLog
                          hours={[0.5, 1, 2, 4, 8]}
                          isToday={logDate === new Date().toLocaleDateString('sv')}
                          pending={logging}
                          onLog={(h) => logNow(justCreated.key, h)}
                        />
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          )}


          {ctx && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_268px]">
              {/* ── content ── */}
              <div className="flex flex-col gap-3">
                {!isTask && (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft/50 px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-semibold text-ink">Tạo nhanh từ task cha</div>
                      <div className="text-caption text-ink-3">
                        Dựa vào tiêu đề và mô tả của{' '}
                        <b className="font-mono text-ink-2">{parentKey}</b> để điền sẵn các ô bên dưới — xem
                        lại rồi bấm Tạo.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={generateFromParent}
                      disabled={fromParentBusy || generating}
                      className="shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-small font-semibold text-on-accent shadow-card hover:bg-accent-2 disabled:opacity-60"
                    >
                      {fromParentBusy ? <Working>Đang điền…</Working> : '✦ Tạo nhanh từ task cha'}
                    </button>
                  </div>
                )}

                <Field label="Bạn định làm gì?">
                  <div className="flex items-start gap-2">
                    <textarea
                      ref={ideaRef}
                      rows={2}
                      autoFocus
                      value={idea}
                      onChange={(e) => {
                        setJustCreated(null)
                        setIdea(e.target.value)
                      }}
                      placeholder="viết unit test cho luồng exclude types…"
                      className="w-full resize-y rounded-lg border border-line bg-ground px-3 py-2 text-body leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={generate}
                      disabled={generating || !idea.trim()}
                      className="shrink-0 rounded-md bg-accent-soft px-2.5 py-1.5 text-body font-medium text-accent-ink hover:brightness-95 disabled:opacity-50"
                    >
                      {generating ? <Working>Đang sinh…</Working> : '✦ Generate'}
                    </button>
                  </div>
                </Field>

                <Field label="Title" hint="không gõ tiền tố ở đây">
                  <input
                    value={title}
                    onChange={(e) => {
                      setJustCreated(null)
                      setTitle(e.target.value)
                    }}
                    className="w-full rounded-lg border border-line bg-ground px-3 py-2 text-emph"
                  />
                  {fullTitle && (
                    <div className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 font-mono text-small leading-relaxed text-ink-2">
                      {teamPrefix && <span className="font-semibold text-blue">{teamPrefix}</span>}
                      {picked.length > 0 && (
                        <span className="font-semibold text-accent-ink">{picked.join('')}</span>
                      )}{' '}
                      {title.trim()}
                    </div>
                  )}
                </Field>

                <Field label="Description">
                  <textarea
                    rows={6}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="- Gemini sẽ điền, sửa lại thoải mái"
                    className="w-full resize-y rounded-lg border border-line bg-ground px-3 py-2 font-mono text-small leading-relaxed"
                  />
                </Field>

                <Field label="Definition of Done" hint="mỗi dòng một gạch đầu dòng">
                  <textarea
                    rows={4}
                    value={dod}
                    onChange={(e) => setDod(e.target.value)}
                    placeholder="- Test chạy xanh trên CI"
                    className="w-full resize-y rounded-lg border border-line bg-ground px-3 py-2 font-mono text-small leading-relaxed"
                  />
                </Field>
              </div>

              {/* ── settings ── */}
              <aside className="flex flex-col gap-3">
                <div className="flex flex-col gap-1 rounded-md bg-surface-2 px-2.5 py-2 text-small text-ink-3">
                  <span className="flex items-center gap-1.5">
                    <span className="text-caption">⛓</span>
                    {isTask ? 'Thuộc epic' : 'Theo task cha'}
                  </span>
                  <b className="font-mono text-small font-semibold text-ink">
                    {ctx.parent.key} · {ctx.parent.summary.slice(0, 40)}
                  </b>
                  {!isTask && ctx.parent.epicSummary && (
                    <span>Epic: {ctx.parent.epicSummary}</span>
                  )}
                  {!isTask && ctx.parent.sprintName && (
                    <span>Sprint: {ctx.parent.sprintName}</span>
                  )}
                </div>

                {ctx.templates.length > 0 && (
                  <Field label="Mẫu lặp lại">
                    <div className="flex flex-wrap gap-1.5">
                      {ctx.templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => applyTemplate(t)}
                          className={
                            'rounded-full border px-[10px] py-[3px] text-small ' +
                            (t.id === templateId
                              ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                              : 'border-line text-ink-2 hover:border-accent hover:text-accent-ink')
                          }
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </Field>
                )}

                <Field label="Tiền tố" hint="thứ tự bấm là thứ tự ghép">
                  <div className="flex flex-wrap gap-1.5">
                    {/* Locked, not toggleable: the team tag is a rule, not a
                        preference, and the server re-applies it regardless. */}
                    {teamPrefix && (
                      <span
                        title="Bắt buộc cho task của team — luôn đứng đầu title"
                        className="inline-flex items-center gap-1 rounded-full border border-blue bg-blue-soft px-[10px] py-[3px] font-mono text-small font-semibold text-blue"
                      >
                        <span className="text-micro">🔒</span>
                        {teamPrefix}
                      </span>
                    )}
                    {allPrefixes.map((label) => {
                      const index = picked.indexOf(label)
                      const on = index !== -1
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            setPicked((list) =>
                              on ? list.filter((p) => p !== label) : [...list, label],
                            )
                          }
                          className={
                            'inline-flex items-center gap-1.5 rounded-full border px-[10px] py-[3px] font-mono text-small ' +
                            (on
                              ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                              : 'border-line bg-surface text-ink-2 hover:border-accent hover:text-accent-ink')
                          }
                        >
                          {on && (
                            <span className="-ml-0.5 grid size-3.5 place-items-center rounded-full bg-accent text-micro font-bold text-on-accent">
                              {index + 1}
                            </span>
                          )}
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {ctx.team.label && (
                    <p className="text-caption leading-relaxed text-ink-3">
                      Tự gắn label{' '}
                      <b className="font-mono text-ink-2">{ctx.team.label}</b> — thiếu label này
                      task sẽ không hiện trên board của team.
                    </p>
                  )}
                </Field>

                {wantsDates && (
                <Field label="Ngày" hint="bắt buộc">
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2">
                      <span className="w-[34px] shrink-0 text-small text-ink-3">Start</span>
                      <DateInput
                        value={startDate}
                        max={dueDate || undefined}
                        aria-label="Start date"
                        onChange={setStartDate}
                        className="min-w-0 flex-1 rounded-md border border-line bg-ground px-2 py-1 font-mono text-small"
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <span className="w-[34px] shrink-0 text-small text-ink-3">Due</span>
                      <DateInput
                        value={dueDate}
                        min={startDate || undefined}
                        aria-label="Due date"
                        onChange={setDueDate}
                        className="min-w-0 flex-1 rounded-md border border-line bg-ground px-2 py-1 font-mono text-small"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <DatePreset
                      label="Hôm nay"
                      onClick={() => {
                        setStartDate(todayIn())
                        setDueDate(todayIn())
                      }}
                    />
                    {targetSprintEnd && (
                      <DatePreset
                        label="Hôm nay → hết sprint"
                        onClick={() => {
                          setStartDate(todayIn())
                          setDueDate(targetSprintEnd)
                        }}
                      />
                    )}
                  </div>
                  {startDate && dueDate && dueDate < startDate && (
                    <p className="text-caption text-crit">Due date đang sớm hơn start date.</p>
                  )}
                </Field>
                )}

                {isTask ? (
                  <Field label="Sprint">
                    <select
                      value={sprintId ?? ''}
                      onChange={(e) => setSprintId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-lg border border-line bg-ground px-3 py-2 text-body"
                    >
                      <option value="">Không gán sprint</option>
                      {ctx.sprints.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.current ? ' (đang chạy)' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-caption leading-relaxed text-ink-3">
                      Chưa cần story point — point task cha là tổng point task con.
                    </p>
                  </Field>
                ) : (
                  <Field label="Story point">
                    {/* A segmented control rather than three cards: the hour range
                        is reference material, so it goes in the tooltip. */}
                    <div className="flex overflow-hidden rounded-md border border-line-strong">
                      {[1, 2, 3].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => {
                            setPoints(p)
                            setPointsPicked(true)
                          }}
                          aria-pressed={points === p}
                          title={`${p} point ≈ ${ctx.budgets[p]}`}
                          className={
                            'flex-1 border-l border-line py-[5px] font-mono text-body first:border-l-0 ' +
                            (points === p
                              ? 'bg-accent-soft font-semibold text-accent-ink'
                              : 'bg-surface text-ink-2 hover:bg-surface-2')
                          }
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <p className="text-caption text-ink-3">
                      {points ? `${points} point ≈ ${ctx.budgets[points]}` : 'Tối đa 3 point.'}
                    </p>
                  </Field>
                )}

                {created.length > 0 && (
                  <div className="rounded-md border border-good/40 bg-good-soft px-2.5 py-2">
                    <div className="mb-1 eyebrow text-good">
                      Đã tạo {created.length}
                    </div>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                      {created.map((c) => (
                        <a
                          key={c.key}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-small font-semibold text-good underline-offset-2 hover:underline"
                        >
                          {c.key}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 rounded-b-xl border-t border-line bg-surface-2 px-4 py-2.5">
          {note && (
            <span className={'text-small ' + (note.ok ? 'text-good' : 'text-crit')}>
              {note.message}
            </span>
          )}
          {!note && ctx && !datesOk && title.trim() && (
            <span className="text-small text-warn">Chọn start date và due date trước khi tạo</span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 font-medium text-body hover:bg-surface-2"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => create()}
              disabled={!canCreate}
              className="rounded-lg bg-accent shadow-card px-3 py-1.5 text-body font-semibold text-on-accent hover:bg-accent-2 disabled:opacity-50"
            >
              {creating ? <Working>Đang tạo…</Working> : 'Tạo trên Jira'}
            </button>
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function DatePreset({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-line px-2 py-[2px] text-caption text-ink-2 hover:border-accent hover:text-accent-ink"
    >
      {label}
    </button>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="flex items-center gap-2 text-xs font-medium text-ink-2">
        {label}
        {hint && <span className="font-normal text-ink-3">· {hint}</span>}
      </span>
      {children}
    </div>
  )
}
