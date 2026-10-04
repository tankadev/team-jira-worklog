import { getOpenSubtasks } from '@/lib/jira/issues'
import { statusTone } from '@/lib/jira/types'

import type { TodayCandidate } from './output'

const TONE_ORDER = { prog: 0, todo: 1, test: 2, ver: 3, done: 4 } as const

/**
 * Candidates for "Today", work in progress first — the likeliest picks sit at
 * the top. None are ticked; the user chooses.
 */
export async function loadTodayCandidates(
  sprintId: number | null,
  opts: { fresh?: boolean } = {},
): Promise<TodayCandidate[]> {
  const open = await getOpenSubtasks(sprintId, opts)
  return open
    .map((t) => ({ ...t, tone: statusTone(t.statusName) }))
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])
    .map((t) => ({ key: t.key, summary: t.summary, statusName: t.statusName }))
}
