/**
 * Which sprint a calendar day belongs to. Free of server imports so the board's
 * client controls (date picker, sprint filter) and the server page share one
 * answer — the pair used to disagree and the board jumped between fortnights.
 */

export interface SprintWindow {
  id: number
  /** `YYYY-MM-DD`, or null for a sprint Jira has not dated yet. */
  start: string | null
  end: string | null
}

/**
 * The sprint a day is logged against.
 *
 * A day inside a sprint's window belongs to it (several overlap → the one that
 * started last, matching how the server picks "now"). A day that no sprint
 * covers is the gap between two sprints: the weekend after sprint N closes on a
 * Friday, before sprint N+1 opens on Monday. Work done then is overtime to
 * finish sprint N, so the gap belongs to the sprint that ended most recently.
 *
 * Returns null only when no sprint has ended before the day — a date before the
 * first dated sprint, which really is outside every sprint.
 */
export function sprintForDate<T extends SprintWindow>(sprints: T[], date: string): T | null {
  const dated = sprints.filter((s) => s.start && s.end)

  const covering = dated.filter((s) => date >= s.start! && date <= s.end!)
  if (covering.length) {
    return covering.sort((a, b) => b.start!.localeCompare(a.start!) || b.id - a.id)[0]
  }

  const ended = dated.filter((s) => s.end! < date)
  if (!ended.length) return null
  return ended.sort((a, b) => b.end!.localeCompare(a.end!) || b.id - a.id)[0]
}
