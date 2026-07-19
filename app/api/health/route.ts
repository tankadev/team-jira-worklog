import { JiraError, getMyself } from '@/lib/jira/client'
import { SETTING_KEYS, getSettings } from '@/lib/settings'

/** Node runtime is the default in v16, but better-sqlite3 makes it worth stating. */
export const runtime = 'nodejs'

/**
 * Read-only status probe: confirms settings loaded out of SQLite and that the
 * stored credentials actually reach Jira. Useful when something breaks and it is
 * not obvious whether the fault is config, network, or auth.
 */
export async function GET() {
  const settings = getSettings()

  const configured = {
    jiraBaseUrl: Boolean(settings[SETTING_KEYS.jiraBaseUrl]),
    jiraEmail: Boolean(settings[SETTING_KEYS.jiraEmail]),
    jiraApiToken: Boolean(settings[SETTING_KEYS.jiraApiToken]),
    googleApiKey: Boolean(settings[SETTING_KEYS.googleApiKey]),
  }

  let jira: Record<string, unknown>
  try {
    const me = await getMyself()
    jira = {
      ok: true,
      accountId: me.accountId,
      displayName: me.displayName,
      timeZone: me.timeZone,
    }
  } catch (error) {
    jira = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      status: error instanceof JiraError ? error.status : undefined,
    }
  }

  return Response.json({
    db: { ok: true, settingsCount: Object.keys(settings).length },
    configured,
    jira,
  })
}
