/**
 * Sprint name helpers, free of server imports so the create modal can derive a
 * prefix from whichever sprint the new issue will actually land in — rather than
 * whichever sprint happens to be running.
 */

/** `VT Sprint 66` → `66`. */
export function sprintNumber(name: string): string | null {
  const m = name.match(/(\d+)\s*$/)
  return m ? m[1] : null
}

export function sprintPrefix(name: string | null | undefined, pattern: string): string | null {
  if (!name || !pattern.trim()) return null
  const n = sprintNumber(name)
  return n ? pattern.replace('{n}', n) : null
}
