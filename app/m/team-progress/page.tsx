import Link from 'next/link'
import { connection } from 'next/server'

import { getMyself, jiraBlockedBy, readCreds } from '@/lib/jira/client'
import { getSprints } from '@/lib/jira/sprints'
import { ModuleGate } from '@/lib/modules/gate'
import { isModuleEnabled } from '@/lib/modules/state'
import { loadProgress } from '@/lib/modules/team-progress/jira'
import {
  getConfig,
  getDailies,
  getDailyMap,
  getDraft,
  getHistory,
  getLastPlatform,
  getSelection,
  listTemplates,
} from '@/lib/modules/team-progress/store'
import { SETTING_KEYS, getSetting } from '@/lib/settings'
import { DEFAULT_TZ, todayIn } from '@/lib/time'

import { JiraDown } from '../../jira-down'
import { Workspace } from './workspace'

const HREF = '/m/team-progress'

/**
 * Everything here is read from Jira, so a dropped VPN has nothing to show —
 * the same single boundary the board and the daily report use.
 */
export default async function TeamProgressPage(props: PageProps<'/m/team-progress'>) {
  await connection()
  if (!isModuleEnabled('team-progress')) return <ModuleGate id="team-progress">{null}</ModuleGate>
  try {
    return await page(props)
  } catch (error) {
    if (!jiraBlockedBy(error)) throw error
    return <JiraDown error={error} retryHref={HREF} />
  }
}

async function page(props: PageProps<'/m/team-progress'>) {
  const creds = readCreds()
  if (!creds) {
    return (
      <div className="card p-5">
        <span className="text-body">Chưa cấu hình Jira — </span>
        <Link href="/settings" className="text-body text-accent-ink underline underline-offset-2">
          mở Settings
        </Link>
      </div>
    )
  }

  const sp = await props.searchParams
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

  const config = getConfig()
  const wanted = one(sp.p) ?? getLastPlatform() ?? config.platforms[0]?.platform ?? 'Web/Desktop'
  const platform = config.platforms.some((p) => p.platform === wanted) ? wanted : (config.platforms[0]?.platform ?? wanted)

  const [me, { sprints, current }] = await Promise.all([getMyself(), getSprints()])
  const sprintParam = Number(one(sp.sprint))
  const sprint = sprints.find((s) => s.id === sprintParam) ?? current ?? sprints[0] ?? null
  const today = todayIn(me.timeZone ?? DEFAULT_TZ)

  if (!sprint) {
    return <div className="card p-5 text-body text-ink-2">Không tìm thấy sprint nào đang chạy trên board.</div>
  }

  const data = await loadProgress(sprint.id)

  return (
    <Workspace
      // A different sprint or platform is a different working set — remount
      // rather than carry ticked boxes and an edited draft across.
      key={`${sprint.id}:${platform}`}
      today={today}
      jiraBase={creds.baseUrl}
      sprints={sprints.map((s) => ({ id: s.id, name: s.name, current: Boolean(s.current) }))}
      sprintId={sprint.id}
      sprintName={sprint.name}
      platform={platform}
      config={config}
      templates={listTemplates()}
      data={data}
      selection={getSelection(platform)}
      draft={getDraft(platform)}
      dailies={getDailies(platform)}
      dailyMap={getDailyMap(platform)}
      lastSent={getHistory(platform)[0] ?? null}
      githubReady={Boolean(getSetting(SETTING_KEYS.githubToken)?.trim())}
      aiReady={Boolean(getSetting(SETTING_KEYS.googleApiKey)?.trim())}
    />
  )
}
