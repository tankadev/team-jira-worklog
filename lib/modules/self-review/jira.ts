import 'server-only'

import { getSprintPoints } from '@/lib/jira/issues'
import { getSprints } from '@/lib/jira/sprints'
import { todayIn } from '@/lib/time'

import { reviewSprint, type SprintReview } from './model'

/**
 * The user's last `count` sprints, oldest first — the order a chart reads in.
 *
 * "Last" means started: the board lists future sprints too, and a sprint that
 * has not begun has nothing to review. Each sprint's rows are the same query
 * the board's points panel runs, fetched together since they are independent.
 */
export async function loadSelfReview(count: number): Promise<SprintReview[]> {
  const { sprints } = await getSprints()
  const today = todayIn()
  const started = sprints
    .filter((s) => s.startDate && s.startDate.slice(0, 10) <= today)
    .slice(0, count)
  const rows = await Promise.all(started.map((s) => getSprintPoints(s.id)))
  return started.map((s, i) => reviewSprint(s, rows[i])).reverse()
}
