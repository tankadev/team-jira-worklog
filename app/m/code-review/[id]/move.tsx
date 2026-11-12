'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { type ItemView, detectJiraKeys } from '@/lib/modules/code-review/model'

import { type PullRow, listPullsAction, movePrAction } from '../actions'
import { BTN, BTN_PRI, CARD, INPUT } from '../ui'

/**
 * The member closed this PR (conflict, wrong base…) and reopened the work as
 * a new one: point the review at the new PR and keep going. Rounds, findings
 * and the chat stay; the old PR is remembered and shown here.
 */
export function MovePrBar({ item, live }: { item: ItemView; live: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pulls, setPulls] = useState<PullRow[] | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [review, setReview] = useState(true)
  const [armed, setArmed] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, start] = useTransition()

  if (item.kind !== 'pr' || !item.prNumber) return null

  const keys = detectJiraKeys({ branch: item.headRef, title: item.title })
  /** Likely the reopened PR: same author, then sharing a Jira key, newest first (GitHub's order). */
  const score = (p: PullRow) =>
    (p.author === item.author ? 2 : 0) + (detectJiraKeys({ branch: p.headRef, title: p.title }).some((k) => keys.includes(k)) ? 1 : 0)
  const candidates = (pulls ?? [])
    .filter((p) => p.number !== item.prNumber && !p.itemId)
    .map((p, i) => ({ p, s: score(p), i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
  const tracked = (pulls ?? []).filter((p) => p.number !== item.prNumber && p.itemId)
  const target = picked ?? (Number(typed.replace(/^#/, '')) || null)

  const load = () =>
    start(async () => {
      const r = await listPullsAction(item.repoId)
      setPulls(r.pulls)
      if (!r.ok) setMsg({ ok: false, text: r.message })
      const best = r.pulls.filter((p) => p.number !== item.prNumber && !p.itemId)
      if (best.length && !picked) {
        const top = best.map((p, i) => ({ p, s: score(p), i })).sort((a, b) => b.s - a.s || a.i - b.i)[0]
        if (top.s > 0) setPicked(top.p.number)
      }
    })

  return (
    <div className="-mt-2 mb-4 text-[12px]">
      <div className="flex flex-wrap items-center gap-2">
        {item.movedFrom.length > 0 && (
          <span className="text-ink-3">
            ↪ Chuyển từ{' '}
            {item.movedFrom.map((m, i) => (
              <span key={m.prNumber}>
                {i > 0 && ', '}
                <a href={m.url} target="_blank" rel="noreferrer" className="font-mono text-ink-2 hover:underline">
                  PR #{m.prNumber} ↗
                </a>
              </span>
            ))}
          </span>
        )}
        <button
          type="button"
          className="text-ink-3 underline-offset-2 hover:text-ink hover:underline"
          title="Member đóng PR này (conflict…) và mở PR mới: review tiếp trên PR mới, giữ nguyên lịch sử review"
          onClick={() => {
            setOpen((v) => !v)
            if (!pulls) load()
          }}
        >
          {open ? 'Đóng' : '↪ Member chuyển sang PR mới?'}
        </button>
      </div>
      {open && (
        <div className={CARD + ' mt-2 !p-3'}>
          <p className="mb-2 text-[11.5px] text-ink-3">
            Hồ sơ này sẽ theo PR mới thay cho #{item.prNumber}: giữ các vòng, finding và chat. Vòng tiếp đọc code PR mới và kiểm tra lại từng finding còn mở.
            Comment đã gửi ở PR cũ vẫn giữ link, và có nút gửi lại lên PR mới. Không gửi gì lên GitHub.
          </p>
          {busy && !pulls && <p className="text-ink-3">Đang tải PR đang mở…</p>}
          {candidates.length > 0 && (
            <ul className="mb-2 max-h-[240px] overflow-auto rounded-md border border-line">
              {candidates.map(({ p, s }) => (
                <li key={p.number}>
                  <label className={'flex cursor-pointer items-center gap-2 border-b border-line px-2.5 py-1.5 last:border-b-0 ' + (picked === p.number ? 'bg-accent-soft' : 'hover:bg-surface-2')}>
                    <input
                      type="radio"
                      name="move-pr"
                      checked={picked === p.number}
                      onChange={() => {
                        setPicked(p.number)
                        setTyped('')
                        setArmed(false)
                      }}
                    />
                    <span className="font-mono text-ink-3">#{p.number}</span>
                    <span className="min-w-0 flex-1 truncate">{p.title}</span>
                    <span className="shrink-0 text-ink-3">{p.author}</span>
                    {s >= 2 && <span className="shrink-0 rounded-full bg-good-soft px-1.5 text-[10.5px] text-good">cùng tác giả</span>}
                    {s % 2 === 1 && <span className="shrink-0 rounded-full bg-blue-soft px-1.5 text-[10.5px] text-blue-ink">cùng ticket</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {pulls && candidates.length === 0 && <p className="mb-2 text-ink-3">Không thấy PR đang mở nào khác chưa có hồ sơ review.</p>}
          {tracked.length > 0 && (
            <p className="mb-2 text-[11.5px] text-ink-3">
              Đã có hồ sơ riêng (lưu trữ / xoá hồ sơ đó trước nếu muốn chuyển vào đây):{' '}
              {tracked.map((p, i) => (
                <span key={p.number}>
                  {i > 0 && ', '}
                  <Link href={`/m/code-review/${p.itemId}`} className="text-accent-ink hover:underline">
                    #{p.number}
                  </Link>
                </span>
              ))}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value)
                setPicked(null)
                setArmed(false)
              }}
              placeholder="hoặc gõ số PR, vd 1931"
              className={INPUT + ' !w-[180px]'}
            />
            <label className="flex items-center gap-1.5 text-ink-2">
              <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />
              Review tiếp ngay
            </label>
            {armed ? (
              <button
                type="button"
                className="rounded-md bg-warn px-2.5 py-1 text-[12.5px] font-medium text-white disabled:opacity-50"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const r = await movePrAction(item.id, target!, review)
                    setMsg({ ok: r.ok, text: r.message })
                    setArmed(false)
                    if (r.ok) {
                      setOpen(false)
                      router.refresh()
                    }
                  })
                }
              >
                Chuyển #{item.prNumber} → #{target}?
              </button>
            ) : (
              <button type="button" className={BTN_PRI} disabled={!target || busy || live} onClick={() => setArmed(true)}>
                Chuyển sang PR {target ? `#${target}` : 'mới'}
              </button>
            )}
            {live && <span className="text-ink-3">Đang có vòng review chạy — đợi xong.</span>}
            <button type="button" className={BTN} disabled={busy} onClick={load}>
              Tải lại
            </button>
          </div>
        </div>
      )}
      {msg && <p className={'mt-1 ' + (msg.ok ? 'text-good' : 'text-crit')}>{msg.text}</p>}
    </div>
  )
}
