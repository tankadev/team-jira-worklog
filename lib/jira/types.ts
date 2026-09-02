/**
 * Types and pure helpers shared by server and client code.
 *
 * Kept free of any server import on purpose: a Client Component that reached
 * into `issues.ts` for something as small as `statusTone` would drag the whole
 * chain — meta → db → node:fs — into the browser bundle and fail the build.
 */

export interface BoardSubtask {
  id: string
  key: string
  summary: string
  statusId: string
  statusName: string
  parentKey: string | null
  storyPoints: number | null
  /** Total logged by everyone, all time — Jira's own `timespent`. */
  timeSpentSeconds: number
  /** Logged by this user on the selected day; filled in by the worklog pass. */
  loggedTodaySeconds: number
  /** Creation time as epoch ms, for the board's created-date sort. 0 if unknown. */
  created: number
  /** Planned start, YYYY-MM-DD. Null when the team has not filled it in. */
  startDate: string | null
  /** Due date, YYYY-MM-DD. */
  dueDate: string | null
  labels: string[]
}

export interface BoardParent {
  key: string
  summary: string
  issueTypeName: string
  statusName: string
  /** The epic above this task. `parent` on a standard issue IS the epic. */
  epicKey: string | null
  epicName: string | null
  /** What the parent currently records. */
  storyPoints: number | null
  /**
   * Sum of its children's points — what it *should* record. Always the total
   * over every child, even when the board hides Done subtasks, so the "save"
   * suggestion never proposes overwriting the parent with a filtered subtotal.
   */
  childPointsTotal: number
  /** How many children the parent has in total, matching `childPointsTotal`. */
  childCount: number
  /**
   * Total time logged across *all* the parent's children, in seconds — the full
   * figure even when the board hides Done ones, so the header total never shrinks
   * with the status filter.
   */
  childTimeSpentTotal: number
  /** Creation time as epoch ms, for the board's created-date sort. 0 if unknown. */
  created: number
  startDate: string | null
  dueDate: string | null
  labels: string[]
  /**
   * Who owns the parent. Null when nobody has taken it, which is treated as
   * editable — an unowned task blocks nobody.
   */
  assigneeAccountId: string | null
  assigneeName: string | null
  /**
   * True when this parent carries no sprint at all, while the board is filtered
   * to one. Its children would otherwise be invisible here despite being the
   * user's own work — see {@link getBoard}.
   */
  outOfSprint: boolean
  /** The children shown on the board — narrowed by the status filter. */
  subtasks: BoardSubtask[]
}

export interface SprintTask {
  key: string
  summary: string
  statusName: string
  issueTypeName: string
  storyPoints: number | null
  subtaskCount: number
  /** The epic this sits under. `parent` on a standard issue IS the epic. */
  epicKey: string | null
  epicName: string | null
  startDate: string | null
  dueDate: string | null
  labels: string[]
}

export interface Transition {
  id: string
  name: string
  toStatusId: string
  toStatusName: string
}

export type StatusTone = 'todo' | 'prog' | 'test' | 'ver' | 'done'

/**
 * Colour bucket for a status. Derived from the name, not `statusCategory`:
 * this instance reports every status between To Do and Done as `indeterminate`,
 * so the category carries no usable signal. Casing is inconsistent in Jira
 * ("Ready For Test On Develop" vs "READY FOR TEST ON INTEGRATION"), hence the
 * case-insensitive compare — but callers must display Jira's exact string.
 */
export function statusTone(name: string): StatusTone {
  const s = name.trim().toUpperCase()
  if (s === 'DONE') return 'done'
  if (s.startsWith('VERIFIED')) return 'ver'
  if (s.startsWith('READY FOR TEST')) return 'test'
  if (s === 'TO DO' || s === 'TODO') return 'todo'
  return 'prog'
}


/**
 * What a team requires of every issue it owns, checked against one issue.
 *
 * The board's saved filter is `labels in (ctalk)`, so an issue missing that
 * label is not merely untidy — it is invisible on the team's own board while
 * still being perfectly visible here, which is the confusing half. The prefix
 * and the two dates are the team's own conventions, unenforced by Jira.
 *
 * Pure and free of server imports so a row can call it while rendering.
 */
export interface IssueHygiene {
  missingLabel: boolean
  missingPrefix: boolean
  missingStartDate: boolean
  missingDueDate: boolean
  /** True when anything above is true — the badge's on/off switch. */
  any: boolean
  /** One short Vietnamese phrase per problem, for the tooltip. */
  problems: string[]
}

export function issueHygiene(
  issue: { summary: string; labels: string[]; startDate: string | null; dueDate: string | null },
  team: { label: string | null; prefix: string | null },
): IssueHygiene {
  const missingLabel = Boolean(
    team.label && !issue.labels.some((l) => l.toLowerCase() === team.label!.toLowerCase()),
  )
  const missingPrefix = Boolean(
    team.prefix && !issue.summary.trim().toLowerCase().startsWith(team.prefix.toLowerCase()),
  )
  const missingStartDate = !issue.startDate
  const missingDueDate = !issue.dueDate

  const problems: string[] = []
  if (missingLabel) problems.push(`thiếu label ${team.label}`)
  if (missingPrefix) problems.push(`thiếu tiền tố ${team.prefix}`)
  if (missingStartDate) problems.push('chưa có start date')
  if (missingDueDate) problems.push('chưa có due date')

  return {
    missingLabel,
    missingPrefix,
    missingStartDate,
    missingDueDate,
    any: problems.length > 0,
    problems,
  }
}

/**
 * Whether a parent task belongs to somebody else, and so must not be edited
 * from this board.
 *
 * Three cases collapse into "editable": the task is mine, nobody has taken it,
 * or we do not know who is looking. Only a task explicitly assigned to another
 * person is locked — an unowned task blocks nobody, and failing open keeps a
 * missing account id from freezing every control on the board.
 *
 * Pure and server-free so the row can call it while rendering.
 */
export function isOwnedByOther(
  assigneeAccountId: string | null,
  myAccountId: string | null | undefined,
): boolean {
  if (!assigneeAccountId || !myAccountId) return false
  return assigneeAccountId !== myAccountId
}
