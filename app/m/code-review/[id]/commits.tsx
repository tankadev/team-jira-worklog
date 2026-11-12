'use client'

import { useCallback, useEffect, useState } from 'react'

import type { CommitRow } from '@/lib/modules/code-review/github'
import { LIVE_STATES, type RoundView } from '@/lib/modules/code-review/model'

import { type CommitDrift, commitsAction } from '../actions'
import { Ago, BTN, CARD, CTITLE } from '../ui'

const short = (sha: string) => sha.slice(0, 7)

/**
 * The PR's commits as on GitHub, each marked with the round that first read
 * it — so a commit pushed after the last round, or one a force-push swapped
 * out from under a round, cannot slip by unreviewed.
 *
 * A round reviews everything up to its head sha, so a commit is covered by
 * the first round whose head is at or after it in the list.
 */
export function CommitsTab({
  itemId,
  rounds,
  roundsLoaded,
  onReview,
}: {
  itemId: number
  rounds: RoundView[]
  /** Until the rounds are in, every commit would read as unreviewed. */
  roundsLoaded: boolean
  onReview: () => void
}) {
  const [commits, setCommits] = useState<CommitRow[] | null>(null)
  const [drift, setDrift] = useState<CommitDrift | null>(null)
  const [showFiles, setShowFiles] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    const r = await commitsAction(itemId)
    setBusy(false)
    setCommits(r.ok ? r.commits : [])
    setDrift(r.drift)
    setMsg(r.ok ? '' : r.message)
  }, [itemId])

  useEffect(() => {
    void load()
  }, [load])

  if (!commits || !roundsLoaded) return <div className={CARD + ' text-[12.5px] text-ink-3'}>Đang tải commit từ GitHub…</div>

  // Rounds that read code: done, or running now. Failed / cancelled ones did not.
  const reading = rounds.filter((r) => r.headSha && (r.state === 'done' || LIVE_STATES.includes(r.state)))
  const at = new Map(commits.map((c, i) => [c.sha, i]))
  const placed = reading.filter((r) => at.has(r.headSha))
  const lost = reading.filter((r) => !at.has(r.headSha))

  /** Round that first covered commit i: smallest round number whose head is at or after it. */
  const coveredBy = (i: number) =>
    placed.filter((r) => at.get(r.headSha)! >= i).sort((a, b) => a.round - b.round)[0] ?? null
  /** Rounds whose head is exactly this commit — the "reviewed up to here" line goes under it. */
  const headsAt = (sha: string) => placed.filter((r) => r.headSha === sha)

  /** History rewritten but the code is what the last round read: nothing is actually unreviewed. */
  const sameCode = Boolean(drift && !drift.error && drift.files.length === 0)
  const unreviewed = sameCode ? 0 : commits.filter((_, i) => !coveredBy(i)).length
  const lastDone = [...reading].reverse().find((r) => r.state === 'done') ?? null
  const running = reading.find((r) => LIVE_STATES.includes(r.state)) ?? null

  return (
    <div className="flex flex-col gap-3">
      <div className={CARD + ' flex flex-wrap items-center gap-2 text-[12.5px]'}>
        <span className="font-medium">{commits.length} commit</span>
        {lastDone && (
          <span className="text-ink-2">
            · vòng {lastDone.round} đã review tới <code className="font-mono">{short(lastDone.headSha)}</code>
          </span>
        )}
        {running && (
          <span className="text-blue-ink">
            · vòng {running.round} đang review tới <code className="font-mono">{short(running.headSha)}</code>
          </span>
        )}
        {commits.length > 0 &&
          (unreviewed > 0 ? (
            <span className="rounded-full bg-warn-soft px-2 py-[2px] font-medium text-warn">{unreviewed} commit chưa được review</span>
          ) : (
            <span className="rounded-full bg-good-soft px-2 py-[2px] font-medium text-good">đã review tới commit cuối ✓</span>
          ))}
        <span className="ml-auto flex gap-1.5">
          {unreviewed > 0 && !running && (
            <button type="button" className={BTN} onClick={onReview} title="Sang tab Kết quả review để chạy vòng tiếp">
              Review tiếp →
            </button>
          )}
          <button type="button" className={BTN} disabled={busy} onClick={() => void load()}>
            {busy ? 'Đang tải…' : 'Tải lại'}
          </button>
        </span>
        {msg && <p className="w-full text-crit">{msg}</p>}
      </div>

      {lost.length > 0 && (
        <div className={CARD + ' text-[12.5px]'}>
          <p className="text-ink-2">
            ⚠ {lost.map((r) => `Vòng ${r.round} (@${short(r.headSha)})`).join(', ')} review commit không còn trong PR — tác giả đã squash / rebase / force-push.
            Các commit bên dưới vì vậy không gắn được với vòng nào.
          </p>
          {drift &&
            (drift.error ? (
              <p className="mt-1.5 text-crit">Không so được code: {drift.error}</p>
            ) : drift.files.length === 0 ? (
              <p className="mt-1.5 font-medium text-good">
                ✓ Code ở head hiện tại ({short(drift.to)}) giống hệt vòng {drift.round} ({short(drift.from)}) — chỉ đổi lịch sử commit, không có code mới chưa review.
              </p>
            ) : (
              <div className="mt-1.5">
                <p className="font-medium text-warn">
                  Head hiện tại ({short(drift.to)}) khác vòng {drift.round} ({short(drift.from)}) ở {drift.files.length} file — phần này chưa được review.{' '}
                  <button type="button" className="font-normal text-ink-3 underline underline-offset-2 hover:text-ink" onClick={() => setShowFiles((v) => !v)}>
                    {showFiles ? 'ẩn' : 'xem file'}
                  </button>
                </p>
                {showFiles && (
                  <ul className="mt-1 font-mono text-[11.5px] text-ink-2">
                    {drift.files.slice(0, 60).map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                    {drift.files.length > 60 && <li>… và {drift.files.length - 60} file nữa</li>}
                  </ul>
                )}
              </div>
            ))}
        </div>
      )}

      {commits.length > 0 && (
        <div className={CARD + ' !p-0'}>
          <div className={CTITLE + ' border-b border-line px-4 py-2.5'}>Commit · cũ → mới, như tab Commits trên GitHub</div>
          <ul>
            {commits.map((c, i) => {
              const by = coveredBy(i)
              const heads = headsAt(c.sha)
              return (
                <li key={c.sha}>
                  <div className={'flex items-start gap-3 border-b border-line px-4 py-2 ' + (by || sameCode ? '' : 'bg-warn-soft/40')}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-[13px]">
                        <span className="truncate">{c.title}</span>
                        {c.body && (
                          <button
                            type="button"
                            className="shrink-0 rounded bg-surface-2 px-1 text-[10.5px] text-ink-3 hover:text-ink"
                            onClick={() => setOpen(open === c.sha ? null : c.sha)}
                            title="Xem nội dung commit"
                          >
                            …
                          </button>
                        )}
                      </div>
                      {open === c.sha && <pre className="mt-1 whitespace-pre-wrap font-sans text-[12px] text-ink-2">{c.body}</pre>}
                      <div className="font-mono text-[11px] text-ink-3">
                        {c.author}
                        <Ago epoch={c.date} prefix=" · " />
                      </div>
                    </div>
                    <span
                      className={
                        'shrink-0 rounded-full px-2 py-[2px] text-[11px] font-medium ' +
                        (!by
                          ? sameCode
                            ? 'bg-surface-2 text-ink-3'
                            : 'bg-warn-soft text-warn'
                          : LIVE_STATES.includes(by.state)
                            ? 'bg-blue-soft text-blue-ink'
                            : 'bg-good-soft text-good')
                      }
                    >
                      {!by ? (sameCode ? 'code đã review' : 'Chưa review') : LIVE_STATES.includes(by.state) ? `Vòng ${by.round} đang đọc` : `Vòng ${by.round}`}
                    </span>
                    <a href={c.url} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-[11.5px] text-accent-ink hover:underline" title={c.sha}>
                      {short(c.sha)} ↗
                    </a>
                  </div>
                  {heads.length > 0 && (
                    <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                      ▲ {heads.map((r) => `vòng ${r.round}`).join(', ')} review tới đây
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
