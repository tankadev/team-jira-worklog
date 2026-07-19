'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { createIssueAction, generateAction, saveDraftAction } from './actions'
import { LinkPending } from '../link-pending'
import { type DraftSummary, DraftList } from './draft-list'
import { type TaskTemplateSummary, TemplatePicker } from './template-picker'
import { ParentPicker } from './parent-picker'
import { PrefixPicker } from './prefix-picker'

interface IssueType {
  id: string
  name: string
  subtask: boolean
  hierarchyLevel: number
}

export interface ParentOption {
  key: string
  summary: string
  epicName: string | null
  sprintId: number | null
  sprintName: string | null
  inCurrentSprint: boolean
  statusName: string
  isDone: boolean
}

interface Draft {
  id: number
  idea: string
  title: string
  description: string
  dod: string
  prefixes: string[]
  issueTypeId: string | null
  parentKey: string | null
  sprintId: number | null
  storyPoints: number | null
}

/**
 * Only these two are offered.
 *
 * Dev work in this team is a Subtask under a Task, and nothing else. Bug, QC,
 * Improve, Story and Support are all filed by other roles — showing them here
 * only creates chances to pick the wrong one, which is awkward to undo once the
 * issue exists on Jira.
 */
const ALLOWED_TYPES = ['Task', 'Subtask']

export function Composer({
  issueTypes,
  parents,
  epics,
  sprints,
  currentSprintId,
  sprintPrefix,
  prefixLibrary,
  budgets,
  fieldIds,
  initialParentKey,
  draft,
  drafts,
  templates,
}: {
  issueTypes: IssueType[]
  parents: ParentOption[]
  epics: Array<{ key: string; summary: string }>
  sprints: Array<{ id: number; name: string; current: boolean }>
  currentSprintId: number | null
  sprintPrefix: string | null
  prefixLibrary: string[]
  budgets: Record<number, string>
  fieldIds: { sprint: string | null; storyPoints: string | null; project: string }
  initialParentKey: string | null
  draft: Draft | null
  drafts: DraftSummary[]
  templates: TaskTemplateSummary[]
}) {
  const router = useRouter()
  const subtaskType = issueTypes.find((t) => t.subtask)
  const standardTypes = issueTypes.filter((t) => !t.subtask && t.hierarchyLevel === 0)

  const [idea, setIdea] = useState(draft?.idea ?? '')
  const [title, setTitle] = useState(draft?.title ?? '')
  const [description, setDescription] = useState(draft?.description ?? '')
  const [dod, setDod] = useState(draft?.dod ?? '')
  const [picked, setPicked] = useState<string[]>(draft?.prefixes ?? [])
  const [typeId, setTypeId] = useState(draft?.issueTypeId ?? subtaskType?.id ?? '')
  const [parentKey, setParentKey] = useState<string | null>(
    draft?.parentKey ?? initialParentKey ?? null,
  )
  const [sprintId, setSprintId] = useState<number | null>(draft?.sprintId ?? currentSprintId)
  const [points, setPoints] = useState<number | null>(draft?.storyPoints ?? 2)
  // Tracks a deliberate pick so generating afterwards cannot quietly replace it.
  const [pointsPicked, setPointsPicked] = useState(draft?.storyPoints != null)
  const [pointsSuggested, setPointsSuggested] = useState<number | null>(null)
  const [draftId, setDraftId] = useState<number | undefined>(draft?.id)
  const [templateId, setTemplateId] = useState<number | undefined>()

  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null)
  const [created, setCreated] = useState<{ key: string; url: string } | null>(null)
  const [generating, startGenerating] = useTransition()
  const [saving, startSaving] = useTransition()
  const [creating, startCreating] = useTransition()

  const type = issueTypes.find((t) => t.id === typeId)
  const isSubtask = Boolean(type?.subtask)
  const parent = parents.find((p) => p.key === parentKey) ?? null

  const fullTitle = useMemo(() => {
    const px = picked.join('')
    return px ? `${px} ${title.trim()}`.trim() : title.trim()
  }, [picked, title])

  // A subtask has neither its own epic nor its own sprint: Jira derives both
  // from the parent Task and rejects an explicit sprint outright.
  const effectiveSprintId = isSubtask ? null : sprintId

  function generate() {
    startGenerating(async () => {
      const res = await generateAction(idea, parent?.summary)
      setNote(res)
      if (res.ok && res.data) {
        setTitle(res.data.title)
        setDescription(res.data.description)
        setDod(res.data.dod)

        // Only fill the estimate when the user has not chosen one. Overwriting
        // a deliberate pick is silent — the number changes while their attention
        // is on the generated text.
        const suggested = res.data.storyPoints ?? null
        setPointsSuggested(suggested)
        if (suggested && !pointsPicked) setPoints(suggested)
      }
    })
  }

  function applyTemplate(t: TaskTemplateSummary) {
    setTitle(t.title)
    setDescription(t.description)
    setDod(t.dod)
    if (t.issueTypeId) setTypeId(t.issueTypeId)
    if (t.storyPoints) {
      setPoints(t.storyPoints)
      setPointsPicked(true)
    }
    // Re-attach the current sprint's prefix; the template never stores one.
    setPicked(sprintPrefix ? [sprintPrefix, ...t.prefixes] : t.prefixes)
    setTemplateId(t.id)
    setNote({ ok: true, message: `Đã áp mẫu "${t.name}" — chọn task cha rồi tạo` })
  }

  function saveDraft() {
    startSaving(async () => {
      const res = await saveDraftAction({
        id: draftId,
        idea,
        title,
        description,
        dod,
        prefixes: picked,
        issueTypeId: typeId,
        parentKey,
        sprintId,
        storyPoints: points,
      })
      setNote(
        res.ok
          ? { ok: true, message: draftId ? 'Đã cập nhật draft' : 'Đã lưu draft — mở lại ở cột phải' }
          : res,
      )
      if (res.ok && res.id) setDraftId(res.id)
    })
  }

  function create() {
    startCreating(async () => {
      const res = await createIssueAction({
        draftId,
        templateId,
        issueTypeId: typeId,
        summary: fullTitle,
        description,
        dod,
        parentKey: isSubtask ? parentKey : parentKey,
        sprintId: effectiveSprintId,
        // A parent's estimate is derived from its children, so leave it unset
        // rather than seeding a number that will be wrong immediately.
        storyPoints: isSubtask ? points : null,
        assignToMe: true,
      })
      setNote(res)
      if (res.ok && res.key && res.url) {
        setCreated({ key: res.key, url: res.url })
        setDraftId(undefined)
      }
    })
  }

  // Both levels need a parent: a Subtask needs its Task, a Task needs its Epic.
  const canCreate = Boolean(fullTitle && typeId && parentKey)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {draftId && !created && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent-soft px-3.5 py-2 text-[12.5px] text-accent-ink lg:col-span-2">
          <b className="font-mono font-semibold">Đang sửa draft</b>
          <span>— sửa xong bấm Lưu draft để cập nhật, hoặc Create on Jira để tạo thật.</span>
          <Link
            href="/new"
            className="ml-auto rounded-md border border-accent/50 bg-surface px-[9px] py-0.5 text-[12px] hover:bg-surface-2"
          >
            <span className="inline-flex items-center gap-1.5">
              Bắt đầu task trống
              <LinkPending />
            </span>
          </Link>
        </div>
      )}

      <section className="rounded-[9px] border border-line bg-surface p-[17px]">
        <Field label="Bạn định làm gì?">
          <textarea
            rows={3}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="làm màn hình quên mật khẩu cho app mobile, gửi otp qua sms…"
            className="w-full resize-y rounded-md border border-line bg-ground px-[10px] py-[7px] text-[13.5px] leading-[1.55]"
          />
        </Field>

        <div className="-mt-0.5 mb-3.5 flex justify-end">
          <button
            type="button"
            onClick={generate}
            disabled={generating || !idea.trim()}
            className="rounded-md bg-accent-soft px-[9px] py-1 text-[12.5px] font-medium text-accent-ink hover:brightness-95 disabled:opacity-60"
          >
            {generating ? 'Đang sinh…' : '✦ Generate với Gemini'}
          </button>
        </div>

        <div className="mb-3.5 border-t border-line" />

        <PrefixPicker
          library={prefixLibrary}
          sprintPrefix={sprintPrefix}
          picked={picked}
          onChange={setPicked}
        />

        <Field label="Title" hint="không gõ tiền tố ở đây">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-line bg-ground px-[10px] py-[7px] text-[13.5px]"
          />
          {fullTitle && (
            <div className="mt-1.5 rounded-md bg-surface-2 px-[10px] py-[7px] font-mono text-[12.5px] leading-[1.5] text-ink-2">
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
            className="w-full resize-y rounded-md border border-line bg-ground px-[10px] py-[7px] font-mono text-[12.5px] leading-[1.6]"
          />
        </Field>

        <Field label="Definition of Done" hint="mỗi dòng một gạch đầu dòng">
          <textarea
            rows={5}
            value={dod}
            onChange={(e) => setDod(e.target.value)}
            placeholder="- Gửi OTP thành công&#10;- OTP hết hạn sau 5 phút"
            className="w-full resize-y rounded-md border border-line bg-ground px-[10px] py-[7px] font-mono text-[12.5px] leading-[1.6]"
          />
        </Field>
      </section>

      <aside className="flex flex-col gap-3.5">
        <section className="rounded-[9px] border border-line bg-surface p-[17px]">
          <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
            Thuộc tính Jira
          </div>

          <Field label="Issue type">
            <div className="flex flex-wrap gap-1.5">
              {[subtaskType, ...standardTypes]
                .filter((t): t is IssueType => Boolean(t))
                .filter((t) => ALLOWED_TYPES.includes(t.name))
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    aria-pressed={typeId === t.id}
                    className={
                      'rounded-md border px-[10px] py-[5px] text-[12.5px] ' +
                      (typeId === t.id
                        ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                        : 'border-line bg-ground text-ink-2 hover:border-line-strong')
                    }
                  >
                    {t.name}
                  </button>
                ))}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
              {isSubtask
                ? 'Chỉ log giờ được vào Subtask. Epic lấy theo task cha.'
                : 'Task bắt buộc thuộc một epic. Log giờ phải tạo Subtask bên dưới.'}
            </p>
          </Field>

          {isSubtask ? (
            <Field label="Task cha" required>
              <ParentPicker
                key="parent-picker"
                parents={parents}
                value={parentKey}
                onChange={setParentKey}
                currentSprintId={currentSprintId}
              />
              {parent && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md bg-surface-2 px-[9px] py-[6px] text-[12px] text-ink-3">
                  <span className="text-[11px]">⛓</span> Jira tự lấy theo task cha
                  {parent.epicName && (
                    <b className="font-mono text-[12px] font-semibold text-ink">{parent.epicName}</b>
                  )}
                  {parent.sprintName && (
                    <b className="font-mono text-[12px] font-semibold text-ink">
                      {parent.sprintName}
                    </b>
                  )}
                </div>
              )}
            </Field>
          ) : (
            <Field label="Epic" required hint="gửi lên Jira bằng field parent">
              <ParentPicker
                key="epic-picker"
                parents={epics.map((e) => ({
                  key: e.key,
                  summary: e.summary,
                  epicName: null,
                  sprintId: null,
                  sprintName: null,
                  inCurrentSprint: false,
                  statusName: '',
                  isDone: false,
                }))}
                value={parentKey}
                onChange={setParentKey}
                currentSprintId={null}
                epicMode
              />
              {epics.length === 0 && (
                <p className="mt-1 text-[11.5px] text-ink-3">
                  Không tìm thấy epic nào đang mở trong project.
                </p>
              )}
            </Field>
          )}

          {!isSubtask && (
            <Field label="Sprint">
              <select
                value={sprintId ?? ''}
                onChange={(e) => setSprintId(e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border border-line bg-ground px-[10px] py-[7px] text-[13.5px]"
              >
                <option value="">Không gán sprint</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.current ? ' (đang chạy)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {isSubtask ? (
            <Field label="Story point estimate">
              <div className="flex gap-1.5">
                {[1, 2, 3].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPoints(p)
                      setPointsPicked(true)
                    }}
                    aria-pressed={points === p}
                    className={
                      'flex flex-1 flex-col items-center gap-px rounded-md border py-[7px] ' +
                      (points === p
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-ground hover:border-line-strong')
                    }
                  >
                    <b
                      className={
                        'font-mono text-[15px] ' + (points === p ? 'text-accent-ink' : '')
                      }
                    >
                      {p}
                    </b>
                    <span
                      className={
                        'font-mono text-[10.5px] ' + (points === p ? 'text-accent-ink' : 'text-ink-3')
                      }
                    >
                      {budgets[p]}
                    </span>
                  </button>
                ))}
              </div>
              {pointsSuggested != null && pointsSuggested !== points ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] leading-relaxed text-ink-3">
                  Gemini đề xuất <b className="font-mono font-semibold text-ink-2">{pointsSuggested}</b>
                  <button
                    type="button"
                    onClick={() => setPoints(pointsSuggested)}
                    className="rounded border border-line px-1.5 py-px font-mono text-[11px] hover:border-accent hover:text-accent-ink"
                  >
                    dùng {pointsSuggested}
                  </button>
                  — đang giữ lựa chọn của bạn.
                </p>
              ) : (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
                  Tối đa 3 point. Việc lớn hơn phải tách nhỏ thành nhiều task con.
                </p>
              )}
            </Field>
          ) : (
            <div className="mb-3 rounded-md bg-surface-2 px-[10px] py-[7px] text-[11.5px] leading-relaxed text-ink-3">
              <b className="font-medium text-ink-2">Chưa cần story point.</b> Point của task cha là
              tổng point các task con — tạo task con xong, board sẽ tính sẵn và cho điền một chạm.
            </div>
          )}

          <div className="mb-3.5 border-t border-line" />

          <div className="flex flex-wrap items-center justify-end gap-2">
            {note && (
              <span className={'mr-auto text-[12px] ' + (note.ok ? 'text-good' : 'text-crit')}>
                {note.message}
              </span>
            )}
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="rounded-md border border-line-strong bg-surface px-[9px] py-1 text-[12.5px] hover:bg-surface-2 disabled:opacity-60"
            >
              {saving ? 'Đang lưu…' : 'Lưu draft'}
            </button>
            <button
              type="button"
              onClick={create}
              disabled={creating || !canCreate}
              title={
                canCreate
                  ? 'Tạo issue thật trên Jira'
                  : `Cần title và ${isSubtask ? 'task cha' : 'epic'}`
              }
              className="rounded-md bg-accent px-3 py-1 text-[12.5px] font-medium text-white hover:bg-accent-2 disabled:opacity-60"
            >
              {creating ? 'Đang tạo…' : 'Create on Jira'}
            </button>
          </div>
        </section>

        {created && (
          <section className="rounded-[9px] border border-good/40 bg-good-soft p-[17px]">
            <div className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.09em] text-good">
              Đã tạo trên Jira
            </div>
            <a
              href={created.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[13px] font-semibold text-good underline underline-offset-2"
            >
              {created.key}
            </a>
            <div className="mt-2.5 flex gap-2">
              <Link
                href="/"
                className="rounded-md border border-line-strong bg-surface px-[9px] py-1 text-[12.5px] hover:bg-surface-2"
              >
                <span className="inline-flex items-center gap-1.5">
                  Về board để log giờ
                  <LinkPending />
                </span>
              </Link>
            </div>
          </section>
        )}

        <section className="rounded-[9px] border border-line bg-surface p-[17px]">
          <div className="mb-2.5 font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
            Sẽ gửi lên Jira
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1 font-mono text-[11px]">
            <Row k="project" v={fieldIds.project} />
            <Row k="issuetype" v={`${typeId || '—'} ${type ? `(${type.name})` : ''}`} />
            {(isSubtask || parentKey) && <Row k="parent" v={parentKey ?? '—'} />}
            {!isSubtask && fieldIds.sprint && (
              <Row k={fieldIds.sprint} v={effectiveSprintId ? String(effectiveSprintId) : '—'} />
            )}
            {isSubtask && fieldIds.storyPoints && (
              <Row k={fieldIds.storyPoints} v={points != null ? String(points) : '—'} />
            )}
            <Row k="summary" v={fullTitle || '—'} />
          </dl>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
            {isSubtask
              ? 'Subtask không gửi epic — Jira lấy theo parent. Id field dò từ createmeta.'
              : 'Field parent ở đây mang nghĩa epic. Id field dò từ createmeta.'}
          </p>
        </section>

        <TemplatePicker
          templates={templates}
          activeId={templateId}
          onApply={applyTemplate}
          onSaved={() => router.refresh()}
          current={{
            title,
            description,
            dod,
            prefixes: picked,
            issueTypeId: typeId,
            storyPoints: points,
          }}
        />

        <DraftList
          drafts={drafts}
          activeId={draftId}
          onDeleted={(id) => {
            if (id === draftId) setDraftId(undefined)
          }}
        />
      </aside>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="mb-3 flex flex-col gap-[5px]">
      <span className="flex items-center gap-2 text-xs font-medium text-ink-2">
        {label}
        {required && (
          <span className="rounded-[3px] bg-crit-soft px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase tracking-[0.05em] text-crit">
            bắt buộc
          </span>
        )}
        {hint && <span className="font-normal text-ink-3">· {hint}</span>}
      </span>
      {children}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="whitespace-nowrap text-ink-3">{k}</dt>
      <dd className="truncate text-ink">{v}</dd>
    </>
  )
}
