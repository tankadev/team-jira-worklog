'use client'

import { useLinkStatus } from 'next/link'

/**
 * Pending indicator for a plain `<Link>`.
 *
 * Controls that navigate through `useNav()` share the board's progress bar, but
 * an ordinary Link bypasses that entirely — and every page here waits on Jira,
 * so those clicks would sit for a second with no feedback at all. Rendered as a
 * child of the Link it belongs to, `useLinkStatus` reports only that link.
 */
export function LinkPending({ className = '' }: { className?: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span
      aria-hidden
      className={
        'inline-block size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current/30 border-t-current ' +
        className
      }
    />
  )
}

/** Dims a Link's own content while it navigates. */
export function LinkDim({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus()
  return <span className={pending ? 'opacity-50' : undefined}>{children}</span>
}
