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
