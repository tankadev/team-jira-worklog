'use client'

import { useState, useTransition } from 'react'

import { commitMessageAction } from '@/app/actions'
import { COMMIT_TYPES, type CommitType, cleanCommitSubject, composeCommitMessage } from '@/lib/commit-message'

import { Icon } from '../icons'
import { Spinner } from '../spinner'
import { Popover } from './popover'

/**
 * A commit message for this subtask, drafted by Gemini from its title and
 * description, ready to copy:
 *
 *   fix: handle crash when opening settings
 *
 *   Ref: VT-2075
 *
 * Drafted on first open and kept for the session. The type is a row of chips
 * and the subject an editable line, so a wrong guess is one click or a few
 * keystrokes — not another round trip. Nothing is written anywhere; it only
 * reads the issue and fills the clipboard.
 */
export function CommitMessageButton({ issueKey }: { issueKey: string }) {
  const [type, setType] = useState<CommitType | null>(null)
  const [subject, setSubject] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function draft() {
    setError(null)
    startTransition(async () => {
      const res = await commitMessageAction(issueKey)
      if (res.ok && res.type && res.subject) {
        setType(res.type)
        setSubject(res.subject)
      } else {
        setError(res.message)
      }
    })
  }

  const message = type && subject.trim() ? composeCommitMessage(type, subject, issueKey) : ''

  async function copy() {
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Trình duyệt chặn clipboard — bôi đen phần xem trước rồi copy tay')
    }
  }

  return (
    <Popover
      align="right"
      panelClassName="w-[420px] max-sm:fixed max-sm:inset-x-3 max-sm:bottom-3 max-sm:top-auto max-sm:w-auto"
      trigger={(open) => (
        <button
          type="button"
          // Drafted when opened for the first time — only on the click, never
          // from an effect, so a failing request cannot loop.
          onClick={() => {
            if (!open && !type && !pending) draft()
          }}
          title="Sinh commit message từ task này"
          aria-label={`Commit message cho ${issueKey}`}
          className={
            'grid size-8 place-items-center rounded-lg border transition-colors ' +
            (open
              ? 'border-accent bg-accent-soft text-accent-ink'
              : 'border-line-strong bg-surface text-ink-3 hover:border-accent hover:text-accent-ink')
          }
        >
          <Icon name="git-commit" className="size-4" />
        </button>
      )}
    >
      {() => (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="eyebrow text-ink-2">Commit message</span>
            <span className="font-mono text-caption text-ink-3">{issueKey}</span>
            <button
              type="button"
              onClick={draft}
              disabled={pending}
              className="ml-auto rounded-md px-2 py-0.5 text-caption font-medium text-ink-3 hover:bg-surface-2 hover:text-accent-ink disabled:opacity-50"
            >
              ↻ Sinh lại
            </button>
          </div>

          {pending && !type ? (
            <p className="flex items-center gap-2 py-3 text-small text-ink-3">
              <Spinner className="size-3" /> Đang đọc task và soạn commit…
            </p>
          ) : error && !type ? (
            <p className="text-small text-crit">{error}</p>
          ) : type ? (
            <>
              {/* Type as chips: switching it is the most common correction, and
                  needs no second request. */}
              <div className="flex flex-wrap gap-1">
                {COMMIT_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    title={t.hint}
                    onClick={() => setType(t.type)}
                    className={
                      'rounded-md border px-1.5 py-0.5 font-mono text-caption ' +
                      (type === t.type
                        ? 'border-accent bg-accent-soft font-semibold text-accent-ink'
                        : 'border-line text-ink-3 hover:border-line-strong hover:text-ink-2')
                    }
                  >
                    {t.type}
                  </button>
                ))}
              </div>

              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                onBlur={() => setSubject((s) => cleanCommitSubject(s))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') copy()
                }}
                aria-label="Subject"
                className="h-8 rounded-lg border border-line-strong bg-ground px-2.5 font-mono text-small"
              />

              <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-ground px-3 py-2.5 font-mono text-small leading-relaxed text-ink">
                {message || '—'}
              </pre>

              <div className="flex items-center gap-2">
                {pending && <Spinner className="size-3 text-ink-3" />}
                {error && <span className="text-caption text-crit">{error}</span>}
                <button
                  type="button"
                  onClick={copy}
                  disabled={!message}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-small font-semibold text-on-accent shadow-card hover:bg-accent-2 disabled:opacity-50"
                >
                  <Icon name={copied ? 'check' : 'copy'} className="size-3.5" />
                  {copied ? 'Đã copy' : 'Copy'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </Popover>
  )
}
