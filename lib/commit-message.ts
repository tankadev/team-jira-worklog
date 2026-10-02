/**
 * Conventional Commits messages for a Jira issue — the format the "Commit
 * message" button on a subtask hands the user to copy.
 *
 *   fix: handle crash when opening settings
 *
 *   Ref: VT-2075
 *
 * Pure, so the popover can switch the type without asking the model again.
 */

export const COMMIT_TYPES = [
  { type: 'feat', hint: 'a new feature or user-visible behaviour' },
  { type: 'fix', hint: 'a bug fix' },
  { type: 'refactor', hint: 'code change that neither fixes a bug nor adds a feature' },
  { type: 'perf', hint: 'a performance improvement' },
  { type: 'style', hint: 'formatting, whitespace, CSS-only visual tweaks with no logic change' },
  { type: 'test', hint: 'adding or fixing tests' },
  { type: 'docs', hint: 'documentation only' },
  { type: 'build', hint: 'build system or dependencies' },
  { type: 'ci', hint: 'CI configuration' },
  { type: 'chore', hint: 'maintenance that touches no product code (config, cleanup, upgrades)' },
] as const

export type CommitType = (typeof COMMIT_TYPES)[number]['type']

export function isCommitType(value: string): value is CommitType {
  return COMMIT_TYPES.some((t) => t.type === value)
}

/**
 * Tidies a subject to the rules: one line, no `type:` or `[TAG]` in front, no
 * Jira key, lowercase first letter, no trailing period. Applied to the model's
 * answer and to whatever the user types, so the copied message is always valid.
 */
export function cleanCommitSubject(raw: string): string {
  let s = raw.split('\n')[0].trim()
  // A type the model (or the user) wrote in anyway: "fix: …", "feat(ui): …".
  s = s.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '')
  // Ticket tags and keys: "[CTALK][Web] …", "VT-123 …", "… (VT-123)".
  s = s.replace(/^(\s*\[[^\]]*\])+\s*/, '')
  s = s.replace(/\(?\b[A-Z][A-Z0-9]+-\d+\b\)?:?/g, '').replace(/\s{2,}/g, ' ').trim()
  s = s.replace(/[.。]+$/, '').trim()
  // Lowercase the first letter only when the word is not an acronym (API, UI).
  if (s && !/^[A-Z]{2,}\b/.test(s)) s = s.charAt(0).toLowerCase() + s.slice(1)
  return s
}

/** The full message: header, a blank line, then the Jira reference. */
export function composeCommitMessage(type: CommitType, subject: string, issueKey: string, scope?: string): string {
  const header = `${type}${scope?.trim() ? `(${scope.trim()})` : ''}: ${cleanCommitSubject(subject)}`
  return `${header}\n\nRef: ${issueKey}`
}
