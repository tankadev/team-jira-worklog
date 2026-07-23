'use server'

import { clearJiraCache } from '@/lib/jira/client'

/**
 * Drops the short Jira read cache so the next render fetches live data. The
 * client pairs this with `router.refresh()` — the manual "Làm mới" escape hatch
 * when you want to bypass the few-second cache immediately.
 */
export async function refreshDataAction() {
  clearJiraCache()
}
