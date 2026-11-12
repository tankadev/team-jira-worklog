'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from 'react'

import type { Discussion, GhComment, GhThread, GithubAccess } from '@/lib/modules/code-review/github'
import { type FindingView, type RoundView, where } from '@/lib/modules/code-review/model'

import {
  commentAction,
  discussionAction,
  followUpAction,
  githubAccessAction,
  postFindingAction,
  replyAction,
  resolveThreadAction,
  submitReviewAction,
} from '../actions'
import { BTN, BTN_PRI, CARD, CTITLE, INPUT, SeverityPill, Ago } from '../ui'
import { AskClaude } from './chat'

/**
 * Talking to the PR from inside the module: post findings, submit a review,
 * read the threads and answer them.
 *
 * Every write here is one explicit click, most of them two (arm, then
 * confirm), and the server side only ever reaches the comment / review
 * endpoints — see lib/modules/code-review/guard.ts. Nothing here can merge,
 * close, approve or touch a branch.
 */

interface GhState {
  /** The item is a GitHub PR and the token can read it: discussion is shown. */
  enabled: boolean
  /** The token can comment: send / reply / resolve are shown. Otherwise Copy only. */
  canWrite: boolean
  access: GithubAccess
  recheck: () => Promise<void>
  itemId: number
  discussion: Discussion | null
  error: string
  loading: boolean
  reload: () => Promise<void>
}

const NO_ACCESS: GithubAccess = { read: false, write: false, reason: '' }

const GhContext = createContext<GhState>({
  enabled: false,
  canWrite: false,
  access: NO_ACCESS,
  recheck: async () => {},
  itemId: 0,
  discussion: null,
  error: '',
  loading: false,
  reload: async () => {},
})

export const useGh = () => useContext(GhContext)

export function GhProvider({
  itemId,
  onGithub,
  initialAccess,
  children,
}: {
  itemId: number
  /** The item is tied to a PR on github.com at all. */
  onGithub: boolean
  initialAccess: GithubAccess
  children: React.ReactNode
}) {
  const [access, setAccess] = useState(initialAccess)
  const enabled = onGithub && access.read
  const [discussion, setDiscussion] = useState<Discussion | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    const r = await discussionAction(itemId)
    setLoading(false)
    if (r.ok && r.discussion) {
      setDiscussion(r.discussion)
      setError('')
    } else setError(r.message)
  }, [enabled, itemId])

  useEffect(() => {
    void reload()
  }, [reload])

  const recheck = useCallback(async () => {
    if (onGithub) setAccess(await githubAccessAction(itemId, true))
  }, [itemId, onGithub])

  return (
    <GhContext.Provider value={{ enabled, canWrite: enabled && access.write, access, recheck, itemId, discussion, error, loading, reload }}>
      {children}
    </GhContext.Provider>
  )
}

/**
 * Shown where send buttons would be, when the token cannot comment: why, and
 * that Copy still works. Nothing to show when it can, or when the item is not
 * on GitHub at all (Copy is simply the only way there).
 */
export function AccessNote({ onGithub }: { onGithub: boolean }) {
  const gh = useGh()
  const [busy, start] = useTransition()
  if (!onGithub || gh.canWrite) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line-strong bg-surface px-3 py-2 text-[12px] text-ink-2">
      <span>🔒 {gh.access.reason || 'Token GitHub chưa có quyền ghi.'} Dùng nút Copy rồi tự dán comment trên GitHub.</span>
      <button type="button" className={BTN + ' ml-auto'} disabled={busy} onClick={() => start(() => gh.recheck())}>
        {busy ? 'Đang kiểm tra…' : 'Kiểm tra lại quyền'}
      </button>
    </div>
  )
}

/** A button that asks once more before doing anything visible to other people. */
export function ConfirmButton({
  label,
  confirm,
  onConfirm,
  disabled,
  primary,
}: {
  label: string
  confirm: string
  onConfirm: () => void
  disabled?: boolean
  primary?: boolean
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 5000)
    return () => clearTimeout(t)
  }, [armed])
  return armed ? (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setArmed(false)
        onConfirm()
      }}
      className="rounded-md bg-warn px-2.5 py-1 text-[12.5px] font-medium text-white disabled:opacity-50"
    >
      {confirm}
    </button>
  ) : (
    <button type="button" disabled={disabled} onClick={() => setArmed(true)} className={primary ? BTN_PRI : BTN}>
      {label}
    </button>
  )
}

/* ── per finding ────────────────────────────────────────────────────────── */

/** "Gửi lên PR", or — once sent — the link and the thread that grew from it. */
export function FindingGithub({ f, onPosted }: { f: FindingView; onPosted: () => void }) {
  const gh = useGh()
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState('')
  if (!gh.enabled) return null

  if (!f.ghUrl) {
    if (!gh.canWrite) return null
    return (
      <span className="inline-flex items-center gap-2">
        <ConfirmButton
          label="Gửi lên PR"
          confirm={f.inDiff ? `Gửi comment vào ${where(f)}?` : 'Gửi thành comment chung?'}
          disabled={busy}
          onConfirm={() =>
            start(async () => {
              const r = await postFindingAction(f.id)
              setMsg(r.ok ? '' : r.message)
              if (r.ok) {
                onPosted()
                void gh.reload()
              }
            })
          }
        />
        {busy && <span className="text-[12px] text-ink-3">Đang gửi…</span>}
        {msg && <span className="text-[12px] text-crit">{msg}</span>}
      </span>
    )
  }

  const thread = f.ghCommentId
    ? gh.discussion?.threads.find((t) => t.comments.some((c) => c.id === f.ghCommentId))
    : undefined
  return (
    <div className="w-full">
      <a href={f.ghUrl} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-good hover:underline">
        ✓ Đã gửi lên PR{f.ghCommentId ? '' : ' (comment chung)'} ↗
      </a>
      {thread ? <ThreadView thread={thread} skipFirst compact hideReply /> : !f.ghCommentId && <ConversationReplies f={f} />}
      {gh.canWrite && <FollowUp f={f} onSent={onPosted} />}
    </div>
  )
}

const quote = (author: string, body: string, viewer: string) =>
  `> **${author}${author === viewer ? ' (tôi)' : ''}:** ${(body.length > 1500 ? `${body.slice(0, 1500)}…` : body).replace(/\n/g, '\n> ')}`

/**
 * A finding already on the PR as a question for Claude: what was said after
 * it (its thread, or for a conversation comment, the PR comments since) and
 * the reply being drafted — is it right, and how should it read.
 */
/** CI bots post status reports, not answers. */
const isBot = (c: GhComment) => /\[bot\]$|^github-actions$/i.test(c.author)

/**
 * What was said after a finding went up: its thread for an inline comment;
 * for a conversation comment, GitHub has no thread, so the comments posted
 * after it — minus bots, the reviewer's other findings and follow-ups, and
 * anything quoting a different comment.
 */
function repliesAfter(f: FindingView, d: Discussion | null): GhComment[] {
  if (!d) return []
  if (f.ghCommentId) return d.threads.find((t) => t.comments.some((c) => c.id === f.ghCommentId))?.comments.filter((c) => c.id !== f.ghCommentId) ?? []
  const mine = d.comments.find((c) => c.url === f.ghUrl)
  if (!mine) return []
  const links = (c: GhComment) => [...c.body.matchAll(/#issuecomment-(\d+)/g)].map((m) => Number(m[1]))
  return d.comments.filter((c) => {
    if (c.createdAt <= mine.createdAt || isBot(c)) return false
    const linked = links(c)
    // Quoting another comment ("[comment trước](…)") = talking about something else.
    if (linked.length && !linked.includes(mine.id)) return false
    // The reviewer's own comments here are other findings or follow-ups; only this finding's follow-ups belong.
    if (c.author === d.viewer) return linked.includes(mine.id)
    return true
  })
}

/**
 * The talk after a conversation comment, under the finding — collapsible,
 * open while the last word is someone else's (it is waiting on the reviewer).
 */
function ConversationReplies({ f }: { f: FindingView }) {
  const gh = useGh()
  const ask = useContext(AskClaude)
  const viewer = gh.discussion?.viewer ?? ''
  const after = repliesAfter(f, gh.discussion)
  const pending = after.length > 0 && after.at(-1)!.author !== viewer
  const [open, setOpen] = useState<boolean | null>(null)
  const shown = open ?? pending
  if (!gh.discussion) return null
  return (
    <div className="mt-2 border-l-2 border-line pl-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="text-ink-3" title="Comment chung không có thread trên GitHub — đây là các comment trên PR sau comment này">
          {after.length ? `${after.length} comment trên PR sau comment này` : 'Chưa có ai trả lời'}
        </span>
        {pending && <span className="rounded bg-blue-soft px-1.5 text-blue-ink">Chờ bạn trả lời</span>}
        {after.length > 0 && ask && (
          <button type="button" className="ml-auto text-accent-ink hover:underline" onClick={() => ask(followUpQuestion(f, '', gh.discussion))}>
            🤖 Hỏi Claude
          </button>
        )}
        {after.length > 0 && (
          <button type="button" className={(ask ? '' : 'ml-auto ') + 'text-ink-3 hover:text-ink'} onClick={() => setOpen(!shown)}>
            {shown ? 'Thu gọn' : 'Mở'}
          </button>
        )}
      </div>
      {shown && after.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {after.map((c) => (
            <CommentView key={c.id} c={c} viewer={viewer} />
          ))}
        </div>
      )}
    </div>
  )
}

function followUpQuestion(f: FindingView, draft: string, d: Discussion | null): string {
  const viewer = d?.viewer ?? ''
  const after = repliesAfter(f, d)
  const talk = after.length ? `\nTrao đổi sau comment đó:\n${after.map((c) => quote(c.author, c.body, viewer)).join('\n>\n')}\n` : '\nChưa có ai trả lời comment đó.\n'
  const reply = draft.trim() ? `\nCâu trả lời tiếp tôi đang định gửi:\n${quote(viewer || 'tôi', draft.trim(), viewer)}\n` : ''
  return `Về finding #${f.id} "${f.title}" (${where(f) || 'comment chung'}) đã gửi lên PR.${talk}${reply}\n${
    reply ? 'Câu trả lời này đã đúng và đủ chưa, so với code hiện tại và những gì member đã nói? Sửa giúp nếu cần.' : 'Nên trả lời tiếp thế nào? Soạn giúp câu trả lời.'
  }`
}

/**
 * "↩ Trả lời tiếp trên PR": the next thing to say about a finding that is
 * already on GitHub — prefilled with what Claude drafted in the later round
 * (it read the member's replies), editable, two clicks to send.
 */
function FollowUp({ f, onSent }: { f: FindingView; onSent: () => void }) {
  const gh = useGh()
  const ask = useContext(AskClaude)
  // Where the reply text can come from: what Claude drafted for the thread in
  // this round, the comment as it reads now (edited or not), or this round's note.
  const sources = [
    f.followReply && { key: 'draft', label: 'Câu Claude soạn', text: f.followReply },
    { key: 'body', label: 'Nội dung comment', text: f.body },
    f.followNote && { key: 'note', label: 'Ghi chú vòng này', text: f.followNote },
  ].filter(Boolean) as Array<{ key: string; label: string; text: string }>
  const [open, setOpen] = useState(Boolean(f.followReply && !f.followSentUrl))
  const [source, setSource] = useState(sources[0].key)
  const [text, setText] = useState(sources[0].text)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null)
  const [busy, start] = useTransition()
  useEffect(() => {
    setSource(sources[0].key)
    setText(sources[0].text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.followReply, f.body])
  // A draft applied from the chat: show it, even if a follow-up was sent before.
  const firstDraft = useRef(f.followReply)
  useEffect(() => {
    if (f.followReply && f.followReply !== firstDraft.current) setOpen(true)
  }, [f.followReply])

  return (
    <div className="mt-2">
      {f.followSentUrl && (
        <a href={f.followSentUrl} target="_blank" rel="noreferrer" className="mr-2 text-[12px] text-good hover:underline">
          ✓ Đã trả lời tiếp ↗
        </a>
      )}
      {!open ? (
        <button type="button" className={BTN} onClick={() => setOpen(true)}>
          ↩ Trả lời tiếp trên PR{f.followReply && !f.followSentUrl ? ' (Claude đã soạn sẵn)' : ''}
        </button>
      ) : (
        <div className="rounded-md border border-line bg-surface-2 p-2">
          <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
            <span>{f.ghCommentId ? 'Trả lời ngay trong thread của comment này' : 'Comment mới trên PR, có trích và link comment cũ'} · lấy nội dung từ:</span>
            {sources.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setSource(s.key)
                  setText(s.text)
                }}
                className={
                  'rounded border px-1.5 py-px ' +
                  (source === s.key ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface hover:bg-surface-2')
                }
              >
                {s.label}
              </button>
            ))}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(10, Math.max(3, text.split('\n').length + 1))}
            className={INPUT + ' leading-relaxed'}
            placeholder="Nội dung trả lời tiếp…"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <ConfirmButton
              primary
              label="↩ Gửi trả lời"
              confirm="Xác nhận gửi lên PR?"
              disabled={busy || !text.trim()}
              onConfirm={() =>
                start(async () => {
                  const r = await followUpAction(f.id, text)
                  setMsg({ ok: r.ok, text: r.message, url: r.url })
                  if (r.ok) {
                    setOpen(false)
                    onSent()
                    void gh.reload()
                  }
                })
              }
            />
            {ask && (
              <button
                type="button"
                className={BTN}
                title="Đưa finding, các trả lời của member và câu trả lời đang soạn vào khung chat với Claude"
                onClick={() => ask(followUpQuestion(f, text, gh.discussion))}
              >
                🤖 Hỏi Claude
              </button>
            )}
            <button type="button" className={BTN} onClick={() => setOpen(false)}>
              Đóng
            </button>
            {busy && <span className="text-[12px] text-ink-3">Đang gửi…</span>}
          </div>
        </div>
      )}
      {msg && <span className={'ml-2 text-[12px] ' + (msg.ok ? 'text-good' : 'text-crit')}>{msg.text}</span>}
    </div>
  )
}

/* ── threads ────────────────────────────────────────────────────────────── */

function CommentView({ c, viewer }: { c: GhComment; viewer: string }) {
  const mine = c.author === viewer
  return (
    <div className={'rounded-md px-2.5 py-2 ' + (mine ? 'bg-accent-soft/50' : 'bg-surface-2')}>
      <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px]">
        {c.avatar && <img src={c.avatar} alt="" className="size-4 rounded-full" />}
        <span className="font-semibold">{c.author}</span>
        {mine && <span className="text-ink-3">(bạn)</span>}
        <a href={c.url} target="_blank" rel="noreferrer" className="text-ink-3 hover:underline">
          <Ago epoch={Math.floor(Date.parse(c.createdAt) / 1000)} />
        </a>
      </div>
      <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{c.body}</div>
    </div>
  )
}

function ReplyBox({ onSend, placeholder }: { onSend: (body: string) => Promise<{ ok: boolean; message: string }>; placeholder: string }) {
  const [body, setBody] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, start] = useTransition()
  return (
    <div className="mt-1.5">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} className={INPUT} placeholder={placeholder} />
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          className={BTN_PRI}
          disabled={busy || !body.trim()}
          onClick={() =>
            start(async () => {
              const r = await onSend(body)
              setMsg(r.ok ? '' : r.message)
              if (r.ok) setBody('')
            })
          }
        >
          {busy ? 'Đang gửi…' : 'Gửi'}
        </button>
        {msg && <span className="text-[12px] text-crit">{msg}</span>}
      </div>
    </div>
  )
}

/**
 * A thread as a question for Claude: where it is, everything said in it, and
 * what to do — judge the last reply against the code, draft the next one.
 * Prefilled, not sent: the reviewer adds what they actually want to know.
 */
function threadQuestion(t: GhThread, viewer: string): string {
  const where = t.path ? `${t.path}${t.line ? `:${t.line}` : ''}` : 'PR'
  const said = t.comments.map((c) => quote(c.author, c.body, viewer)).join('\n>\n')
  const last = t.comments.at(-1)
  const ask =
    last && last.author !== viewer
      ? `${last.author} trả lời như trên có đúng không? Đối chiếu với code hiện tại của PR, rồi soạn giúp câu trả lời tiếp trong thread này (nếu cần).`
      : 'Đánh giá giúp trao đổi này dựa trên code hiện tại của PR.'
  return `Về thread trên PR ở ${where}${t.isOutdated ? ' (code đã đổi sau comment)' : ''}${t.isResolved ? ' (đã đánh dấu xong)' : ''}:\n${said}\n\n${ask}`
}

export function ThreadView({
  thread,
  skipFirst,
  compact,
  hideReply,
}: {
  thread: GhThread
  skipFirst?: boolean
  compact?: boolean
  /** The finding card has its own follow-up composer. */
  hideReply?: boolean
}) {
  const gh = useGh()
  const ask = useContext(AskClaude)
  const [busy, start] = useTransition()
  const [open, setOpen] = useState(!thread.isResolved)
  const viewer = gh.discussion?.viewer ?? ''
  const shown = skipFirst ? thread.comments.slice(1) : thread.comments
  const last = thread.comments.at(-1)
  const pending = last && last.author !== viewer

  const toggleResolve = () =>
    start(async () => {
      await resolveThreadAction(gh.itemId, thread.id, !thread.isResolved)
      await gh.reload()
    })

  return (
    <div className={compact ? 'mt-2 border-l-2 border-line pl-2.5' : ''}>
      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        {compact ? (
          <span className="text-ink-3">{shown.length ? `${shown.length} phản hồi` : 'Chưa có phản hồi'}</span>
        ) : (
          <span className="font-mono text-ink-2">
            {thread.path}
            {thread.line ? `:${thread.line}` : ''}
          </span>
        )}
        {thread.isResolved && <span className="rounded bg-good-soft px-1.5 text-good">Đã xong</span>}
        {thread.isOutdated && <span className="rounded bg-surface-2 px-1.5 text-ink-3">Code đã đổi</span>}
        {pending && !thread.isResolved && <span className="rounded bg-blue-soft px-1.5 text-blue-ink">Chờ bạn trả lời</span>}
        {ask && (!compact || shown.length > 0) && (
          <button
            type="button"
            className="ml-auto text-accent-ink hover:underline"
            title="Đưa cả trao đổi trong thread này vào khung chat với Claude — sửa câu hỏi rồi gửi"
            onClick={() => ask(threadQuestion(thread, viewer))}
          >
            🤖 Hỏi Claude
          </button>
        )}
        <button type="button" className={(ask && (!compact || shown.length > 0) ? '' : 'ml-auto ') + 'text-ink-3 hover:text-ink'} onClick={() => setOpen((v) => !v)}>
          {open ? 'Thu gọn' : 'Mở'}
        </button>
        {gh.canWrite && (
          <button type="button" className="text-ink-3 hover:text-ink disabled:opacity-50" disabled={busy} onClick={toggleResolve}>
            {thread.isResolved ? 'Mở lại' : 'Đánh dấu xong'}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {shown.map((c) => (
            <CommentView key={c.id} c={c} viewer={viewer} />
          ))}
          {gh.canWrite && !hideReply && (
            <ReplyBox
              placeholder="Trả lời trong thread này…"
              onSend={async (body) => {
                const r = await replyAction(gh.itemId, thread.comments[0].id, body)
                if (r.ok) await gh.reload()
                return r
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}

/* ── the whole discussion ───────────────────────────────────────────────── */

const REVIEW_STATE: Record<string, string> = {
  APPROVED: '✅ Đã duyệt',
  CHANGES_REQUESTED: '✋ Yêu cầu sửa',
  COMMENTED: '💬 Góp ý',
  DISMISSED: 'Đã gỡ',
}

export function DiscussionPanel() {
  const gh = useGh()
  const [showResolved, setShowResolved] = useState(false)
  const d = gh.discussion

  if (!d) {
    return (
      <div className={CARD + ' text-[12.5px] ' + (gh.error ? 'text-crit' : 'text-ink-3')}>
        {gh.error || 'Đang tải thảo luận từ GitHub…'}
      </div>
    )
  }

  const threads = d.threads.filter((t) => showResolved || !t.isResolved)
  const resolved = d.threads.filter((t) => t.isResolved).length
  const timeline = [
    ...d.comments.map((c) => ({ at: c.createdAt, c, r: null })),
    ...d.reviews.map((r) => ({ at: r.submittedAt, c: null, r })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="flex flex-col gap-4">
      <AccessNote onGithub />
      <div className={CARD}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className={CTITLE}>
            Thread trên code · {d.threads.length - resolved} đang mở{resolved ? ` · ${resolved} đã xong` : ''}
          </div>
          <label className="ml-auto flex items-center gap-1.5 text-[12px] text-ink-2">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            Hiện thread đã xong
          </label>
          <button type="button" className={BTN} disabled={gh.loading} onClick={() => void gh.reload()}>
            {gh.loading ? 'Đang tải…' : 'Tải lại'}
          </button>
        </div>
        {threads.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Không có thread nào{resolved && !showResolved ? ' đang mở' : ''}.</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {threads.map((t) => (
              <div key={t.id} className="py-3 first:pt-0 last:pb-0">
                <ThreadView thread={t} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={CARD}>
        <div className={CTITLE + ' mb-2'}>Conversation</div>
        <div className="flex flex-col gap-1.5">
          {timeline.length === 0 && <p className="text-[12.5px] text-ink-3">Chưa có comment chung nào.</p>}
          {timeline.map((e, i) =>
            e.c ? (
              <CommentView key={`c${i}`} c={e.c} viewer={d.viewer} />
            ) : (
              <div key={`r${i}`} className="rounded-md border border-line px-2.5 py-2">
                <div className="text-[11.5px]">
                  <span className="font-semibold">{e.r!.author}</span> · {REVIEW_STATE[e.r!.state] ?? e.r!.state} ·{' '}
                  <a href={e.r!.url} target="_blank" rel="noreferrer" className="text-ink-3 hover:underline">
                    <Ago epoch={Math.floor(Date.parse(e.r!.submittedAt) / 1000)} />
                  </a>
                </div>
                {e.r!.body && <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{e.r!.body}</div>}
              </div>
            ),
          )}
        </div>
        {gh.canWrite && (
          <ReplyBox
            placeholder="Comment chung trên PR…"
            onSend={async (body) => {
              const r = await commentAction(gh.itemId, body)
              if (r.ok) await gh.reload()
              return r
            }}
          />
        )}
      </div>
    </div>
  )
}

/* ── submitting a whole review ──────────────────────────────────────────── */

export function SubmitReview({
  round,
  findings,
  onDone,
}: {
  round: RoundView
  findings: FindingView[]
  onDone: () => void
}) {
  const gh = useGh()
  const candidates = findings.filter((f) => !f.ghUrl && f.status !== 'fixed' && f.status !== 'dismissed')
  const [picked, setPicked] = useState<Set<number>>(() => new Set(candidates.map((f) => f.id)))
  const [event, setEvent] = useState<'COMMENT' | 'REQUEST_CHANGES'>(round.verdict === 'request_changes' ? 'REQUEST_CHANGES' : 'COMMENT')
  const [open, setOpen] = useState(false)
  // Empty by default: the reviewer rarely writes a summary. Loose comments
  // (no line) are listed in the body on their own.
  const [body, setBody] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null)
  const [busy, start] = useTransition()
  if (!gh.canWrite) return null

  const chosen = candidates.filter((f) => picked.has(f.id))
  const inline = chosen.filter((f) => f.inDiff && f.line).length

  return (
    <div className={CARD}>
      <div className="flex flex-wrap items-center gap-2">
        <div className={CTITLE}>Gửi review lên GitHub</div>
        <span className="text-[12px] text-ink-2">
          {candidates.length ? `${candidates.length} điểm chưa gửi` : 'Đã gửi hết các điểm còn mở'}
        </span>
        {msg && (
          <span className={'text-[12px] ' + (msg.ok ? 'text-good' : 'text-crit')}>
            {msg.text}{' '}
            {msg.url && (
              <a href={msg.url} target="_blank" rel="noreferrer" className="underline">
                Xem ↗
              </a>
            )}
          </span>
        )}
        <button type="button" className={BTN + ' ml-auto'} onClick={() => setOpen((v) => !v)}>
          {open ? 'Đóng' : 'Soạn review'}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          <p className="mb-2 text-[12px] text-ink-3">
            Gửi một lần: các điểm đã chọn thành comment inline; comment rời và điểm ngoài diff được liệt kê trong nội dung review. Tác giả nhận một thông báo.
          </p>
          <ul className="mb-2 max-h-[260px] overflow-y-auto rounded-md border border-line">
            {candidates.map((f) => (
              <li key={f.id} className="border-b border-line last:border-0">
                <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12.5px] hover:bg-surface-2/60">
                  <input
                    type="checkbox"
                    checked={picked.has(f.id)}
                    onChange={() =>
                      setPicked((s) => {
                        const n = new Set(s)
                        if (n.has(f.id)) n.delete(f.id)
                        else n.add(f.id)
                        return n
                      })
                    }
                  />
                  <SeverityPill s={f.severity} />
                  <span className="truncate">{f.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">
                    {where(f) || 'comment rời'} {f.inDiff ? '· trên dòng code' : '· trong nội dung'}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            className={INPUT + ' mb-2'}
            placeholder="Lời nhắn đầu review (không bắt buộc)"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select value={event} onChange={(e) => setEvent(e.target.value as typeof event)} className={INPUT + ' w-auto'}>
              <option value="COMMENT">💬 Góp ý (Comment)</option>
              <option value="REQUEST_CHANGES">✋ Yêu cầu sửa (Request changes)</option>
            </select>
            <ConfirmButton
              primary
              label={`Gửi review (${inline} comment trên dòng code${chosen.length - inline ? ` + ${chosen.length - inline} trong nội dung` : ''})`}
              confirm={event === 'REQUEST_CHANGES' ? 'Xác nhận gửi "Yêu cầu sửa"?' : 'Xác nhận gửi review?'}
              disabled={busy || (!chosen.length && !body.trim())}
              onConfirm={() =>
                start(async () => {
                  const r = await submitReviewAction({ roundId: round.id, findingIds: [...picked], body, event })
                  setMsg({ ok: r.ok, text: r.message, url: r.url })
                  if (r.ok) {
                    setOpen(false)
                    onDone()
                    void gh.reload()
                  }
                })
              }
            />
            {busy && <span className="text-[12px] text-ink-3">Đang gửi…</span>}
          </div>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Không có "Duyệt" (Approve) ở đây: duyệt có thể kích hoạt auto-merge, nên module chỉ gửi Góp ý hoặc Yêu cầu sửa — duyệt thì bấm trên GitHub.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * One click (two, to confirm) to answer on the PR with the comment exactly as
 * it reads now — after editing it in a later round — instead of copying it
 * into a reply box. Inline comments get the reply in their thread.
 */
export function ReplyWithBody({ f, body, onSent }: { f: FindingView; body: string; onSent: () => void }) {
  const gh = useGh()
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  if (!gh.canWrite || !f.ghUrl) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <ConfirmButton
        label="↩ Reply nội dung này"
        confirm={f.ghCommentId ? 'Gửi vào thread trên PR?' : 'Gửi comment tiếp trên PR?'}
        disabled={busy || !body.trim()}
        onConfirm={() =>
          start(async () => {
            const r = await followUpAction(f.id, body)
            setMsg({ ok: r.ok, text: r.message })
            if (r.ok) {
              onSent()
              void gh.reload()
            }
          })
        }
      />
      {busy && <span className="text-[12px] text-ink-3">Đang gửi…</span>}
      {msg && <span className={'text-[12px] ' + (msg.ok ? 'text-good' : 'text-crit')}>{msg.text}</span>}
    </span>
  )
}
