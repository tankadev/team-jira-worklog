'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'

import { createIssueAction, generateAction } from '@/app/new/actions'
import { sprintPrefix } from '@/lib/sprint-name'

import { Spinner, Working } from '../spinner'
import { useNav } from './navigation'

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
  sprints: Array<{ id: number; name: string; current: boolean }>
  currentSprintId: number | null
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

  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null)
  const [created, setCreated] = useState<Array<{ key: string; url: string; id: string }>>([])
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

  const fullTitle = useMemo(() => {
    const px = picked.join('')
    return px ? `${px} ${title.trim()}`.trim() : title.trim()
  }, [picked, title])

  const isTask = mode === 'task'

  /**
   * A subtask inherits the parent's sprint; a task goes to the one chosen here.
   * Either way it is that sprint's number in the prefix — using today's running
   * sprint mislabels anything created while reviewing an earlier one.
   */
  const targetSprintName = isTask
    ? (ctx?.sprints.find((s) => s.id === sprintId)?.name ?? null)
    : (ctx?.parent.sprintName ?? null)

  const currentPrefix = ctx ? sprintPrefix(targetSprintName, ctx.sprintPrefixPattern) : null
  const allPrefixes = ctx ? [...(currentPrefix ? [currentPrefix] : []), ...ctx.prefixes] : []

  // Swap the sprint prefix whenever the target sprint changes, leaving every
  // other chip and its position untouched.
  useEffect(() => {
    if (!ctx) return
    setPicked((list) => {
      const withoutSprint = list.filter((p) => !/^\[spt\s/i.test(p))
      return currentPrefix ? [currentPrefix, ...withoutSprint] : withoutSprint
    })
  }, [ctx, currentPrefix])


  function applyTemplate(t: Template) {
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
      })
      setNote(res)
      if (res.ok && res.key && res.url) {
        const next = [...created, { key: res.key, url: res.url, id: res.id ?? '' }]
        setCreated(next)
        setTitle('')
        setDescription('')
        setDod('')
        setIdea('')
        setTemplateId(undefined)

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
      }
    })
  }

  const canCreate = Boolean(fullTitle && ctx?.issueTypeId && !creating)

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-auto bg-black/45 p-4 sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tạo ${isTask ? 'task' : 'task con'} dưới ${parentKey}`}
        className="w-full max-w-[980px] rounded-xl border border-line-strong bg-surface shadow-2xl"
      >
        <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <span className="rounded-[3px] bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            {isTask ? 'Task' : 'Task con'}
          </span>
          <h3 className="text-[14px] font-semibold">
            Tạo dưới <span className="font-mono text-accent-ink">{parentKey}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="ml-auto grid size-7 place-items-center rounded-md text-[18px] leading-none text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="max-h-[74vh] overflow-auto px-4 py-4">
          {loadError && <p className="text-[13px] text-crit">{loadError}</p>}

          {!ctx && !loadError && (
            <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
              <Spinner /> Đang tải…
            </p>
          )}

          {ctx && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_268px]">
              {/* ── content ── */}
              <div className="flex flex-col gap-3">
                <Field label="Bạn định làm gì?">
                  <div className="flex items-start gap-2">
                    <textarea
                      rows={2}
                      autoFocus
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      placeholder="viết unit test cho luồng exclude types…"
                      className="w-full resize-y rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px] leading-relaxed"
                    />
                    <button
                      type="button"
                      onClick={generate}
                      disabled={generating || !idea.trim()}
                      className="shrink-0 rounded-md bg-accent-soft px-2.5 py-1.5 text-[12.5px] font-medium text-accent-ink hover:brightness-95 disabled:opacity-50"
                    >
                      {generating ? <Working>Đang sinh…</Working> : '✦ Generate'}
                    </button>
                  </div>
                </Field>

                <Field label="Title" hint="không gõ tiền tố ở đây">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13.5px]"
                  />
                  {fullTitle && (
                    <div className="mt-1.5 rounded-md bg-surface-2 px-2.5 py-1.5 font-mono text-[12px] leading-relaxed text-ink-2">
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
                    className="w-full resize-y rounded-md border border-line bg-ground px-2.5 py-1.5 font-mono text-[12px] leading-relaxed"
                  />
                </Field>

                <Field label="Definition of Done" hint="mỗi dòng một gạch đầu dòng">
                  <textarea
                    rows={4}
                    value={dod}
                    onChange={(e) => setDod(e.target.value)}
                    placeholder="- Test chạy xanh trên CI"
                    className="w-full resize-y rounded-md border border-line bg-ground px-2.5 py-1.5 font-mono text-[12px] leading-relaxed"
                  />
                </Field>
              </div>

              {/* ── settings ── */}
              <aside className="flex flex-col gap-3">
                <div className="flex flex-col gap-1 rounded-md bg-surface-2 px-2.5 py-2 text-[11.5px] text-ink-3">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[11px]">⛓</span>
                    {isTask ? 'Thuộc epic' : 'Theo task cha'}
                  </span>
                  <b className="font-mono text-[11.5px] font-semibold text-ink">
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
                            'rounded-full border px-[10px] py-[3px] text-[11.5px] ' +
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
                            'inline-flex items-center gap-1.5 rounded-full border px-[10px] py-[3px] font-mono text-[11.5px] ' +
                            (on
                              ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                              : 'border-line bg-surface text-ink-2 hover:border-accent hover:text-accent-ink')
                          }
                        >
                          {on && (
                            <span className="-ml-0.5 grid size-3.5 place-items-center rounded-full bg-accent text-[9px] font-bold text-white">
                              {index + 1}
                            </span>
                          )}
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </Field>

                {isTask ? (
                  <Field label="Sprint">
                    <select
                      value={sprintId ?? ''}
                      onChange={(e) => setSprintId(e.target.value ? Number(e.target.value) : null)}
                      className="w-full rounded-md border border-line bg-ground px-2.5 py-1.5 text-[13px]"
                    >
                      <option value="">Không gán sprint</option>
                      {ctx.sprints.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.current ? ' (đang chạy)' : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] leading-relaxed text-ink-3">
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
                            'flex-1 border-l border-line py-[5px] font-mono text-[12.5px] first:border-l-0 ' +
                            (points === p
                              ? 'bg-accent-soft font-semibold text-accent-ink'
                              : 'bg-surface text-ink-2 hover:bg-surface-2')
                          }
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-3">
                      {points ? `${points} point ≈ ${ctx.budgets[points]}` : 'Tối đa 3 point.'}
                    </p>
                  </Field>
                )}

                {created.length > 0 && (
                  <div className="rounded-md border border-good/40 bg-good-soft px-2.5 py-2">
                    <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.07em] text-good">
                      Đã tạo {created.length}
                    </div>
                    <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                      {created.map((c) => (
                        <a
                          key={c.key}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[11.5px] font-semibold text-good underline-offset-2 hover:underline"
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
            <span className={'text-[12px] ' + (note.ok ? 'text-good' : 'text-crit')}>
              {note.message}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[12.5px] hover:bg-surface-2"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={create}
              disabled={!canCreate}
              className="rounded-md bg-accent px-3 py-1 text-[12.5px] font-medium text-white hover:bg-accent-2 disabled:opacity-50"
            >
              {creating ? <Working>Đang tạo…</Working> : 'Tạo trên Jira'}
            </button>
          </span>
        </footer>
      </div>
    </div>
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
