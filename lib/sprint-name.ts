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

/**
 * Matches whatever the current pattern produces, so a stale sprint prefix can be
 * swapped out when the target sprint changes.
 *
 * Derived from the pattern rather than hardcoded. `/^\[spt\s/` was fine while
 * the pattern was `[spt {n}]`, but a team writing `[SPT-{n}]` got no match — the
 * old chip stayed and titles ended up carrying two sprint numbers.
 */
export function sprintPrefixRegex(pattern: string): RegExp | null {
  if (!pattern.includes('{n}')) return null
  const escaped = pattern
    .split('{n}')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\d+')
  return new RegExp(`^${escaped}$`, 'i')
}

/** Drops any chip that is a sprint prefix, leaving every other one in place. */
export function withoutSprintPrefix(prefixes: string[], pattern: string): string[] {
  const re = sprintPrefixRegex(pattern)
  return re ? prefixes.filter((p) => !re.test(p)) : prefixes
}
