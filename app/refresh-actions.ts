'use server'

import { revalidatePath } from 'next/cache'

import { clearJiraCache } from '@/lib/jira/client'

/**
 * The manual "Làm mới": drops the Jira read cache and every page held in
 * the browser's client cache (see `staleTimes` in next.config), so the next
 * render of any screen fetches live data. The client pairs this with
 * `router.refresh()` for the screen on view.
 */
export async function refreshDataAction() {
  clearJiraCache()
  revalidatePath('/', 'layout')
}

/**
 * After a write from the board: the other screens kept in the client cache now
 * show old numbers (hours on the report, a status on the board), so they are
 * marked stale too — not only the one being refreshed. The server read cache is
 * already cleared by the write itself.
 */
export async function invalidateViewsAction() {
  revalidatePath('/', 'layout')
}
