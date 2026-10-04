'use server'

import { loadTodayCandidates } from './candidates'
import type { TodayCandidate } from './output'

/**
 * "Today" read straight from Jira, past both caches. The page itself can come
 * out of the browser's client cache (see `staleTimes`) or the server read cache,
 * so a task assigned since then would be missing from the picks until the user
 * found "Làm mới". Null on failure: the list the page rendered with stands.
 */
export async function refreshTodayCandidatesAction(
  sprintId: number | null,
): Promise<TodayCandidate[] | null> {
  if (sprintId !== null && !Number.isInteger(sprintId)) return null
  try {
    return await loadTodayCandidates(sprintId, { fresh: true })
  } catch {
    return null
  }
}
