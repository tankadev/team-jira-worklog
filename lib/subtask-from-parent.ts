/**
 * Turns a parent issue's title into the parts of a subtask title.
 *
 * "Tạo nhanh từ task cha" copies the parent — a QC Bug, a task someone else
 * wrote — into a subtask the user can log against. The parent's title arrives
 * already prefixed (`CLONE - [CTALK][SPT-71][Support] Review …`), and copying it
 * verbatim would stack a second set of prefixes in front of the first. So it is
 * taken apart: the team and sprint tags are dropped (the create path puts the
 * current ones back), the tags the app knows as chips become chips, and only the
 * words remain as the title.
 *
 * Pure and free of server imports — both the board and the dialog call it.
 */
import { sprintPrefixRegex } from './sprint-name'

export interface ParentTitleParts {
  /** The words of the title, with any unrecognised tags kept in front of them. */
  title: string
  /** Configured prefix chips found in the parent's title, in their order there. */
  picked: string[]
}

/** Any sprint tag, whatever the team's own pattern: `[spt 71]`, `[SPT-71]`, `[Sprint 71]`. */
const ANY_SPRINT_TAG = /^\[\s*(?:spt|sprint)[\s\-_]*\d+\s*\]$/i

export function subtaskFromParent(
  parentSummary: string,
  opts: { prefixes: string[]; teamPrefix: string | null; sprintPattern: string },
): ParentTitleParts {
  // "CLONE - " is what Jira's clone action leaves behind; it describes how the
  // parent was made, not the work.
  let rest = parentSummary.trim().replace(/^clone\s*[-:–]\s*/i, '')

  const tags: string[] = []
  for (;;) {
    const m = rest.match(/^\s*(\[[^\]\n]{1,40}\])/)
    if (!m) break
    tags.push(m[1])
    rest = rest.slice(m[0].length)
  }
  rest = rest.replace(/^\s*[-:–]\s*/, '').trim()

  const sprintRe = sprintPrefixRegex(opts.sprintPattern)
  const known = new Map(opts.prefixes.map((p) => [p.toLowerCase(), p]))
  const team = opts.teamPrefix?.toLowerCase() ?? null

  const picked: string[] = []
  const unknown: string[] = []
  for (const tag of tags) {
    const low = tag.toLowerCase()
    if (team && low === team) continue
    if (ANY_SPRINT_TAG.test(tag) || sprintRe?.test(tag)) continue
    const chip = known.get(low)
    if (chip) {
      if (!picked.includes(chip)) picked.push(chip)
    } else {
      unknown.push(tag)
    }
  }

  return {
    title: unknown.length ? `${unknown.join('')} ${rest}`.trim() : rest,
    picked,
  }
}

/**
 * The default dates for a subtask made in one click: it starts on the day being
 * logged and is due when the parent is, or when the sprint ends — never before
 * it starts.
 */
export function defaultSubtaskDates(
  start: string,
  parentDue: string | null,
  sprintEnd: string | null,
): { startDate: string; dueDate: string } {
  const due = parentDue ?? sprintEnd ?? start
  return { startDate: start, dueDate: due < start ? start : due }
}

/** A parent's estimate carried over only when it is a valid subtask estimate (1–3). */
export function subtaskPointsFrom(parentPoints: number | null | undefined, fallback: number): number {
  return parentPoints && parentPoints >= 1 && parentPoints <= 3 ? Math.round(parentPoints) : fallback
}

/**
 * The finished summary: team tag, sprint tag and chips in front of the words.
 * A title that already opens with a tag of its own joins without a space, so
 * `[QA] Kiểm tra` reads `[CTALK][Web][QA] Kiểm tra`, not `[CTALK][Web] [QA] …`.
 */
export function composeSubtaskTitle(prefixes: Array<string | null | undefined>, title: string): string {
  const px = prefixes.filter(Boolean).join('')
  const t = title.trim()
  if (!t) return ''
  return px ? `${px}${t.startsWith('[') ? '' : ' '}${t}` : t
}
