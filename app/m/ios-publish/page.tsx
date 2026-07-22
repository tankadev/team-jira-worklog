import { connection } from 'next/server'

import { ModuleGate } from '@/lib/modules/gate'
import { getIosConfig, isIosConfigured, toProfileView } from '@/lib/modules/ios-publish/config'
import { listIosLog } from '@/lib/modules/ios-publish/store'

import { IosPublish } from './form'

const when = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Saigon',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export default async function IosPublishPage() {
  await connection()
  const cfg = getIosConfig()
  const log = listIosLog().map((e) => ({
    id: e.id,
    appName: e.appName,
    buildNumber: e.buildNumber,
    groupName: e.groupName,
    state: e.state,
    ok: e.ok,
    message: e.message,
    when: when.format(new Date(e.createdAt * 1000)),
  }))

  return (
    <ModuleGate id="ios-publish">
      <IosPublish
        configured={isIosConfigured()}
        config={{
          profiles: cfg.profiles.map(toProfileView),
          apps: cfg.apps,
          chatTemplate: cfg.chatTemplate,
          hasWebhook: Boolean(cfg.chatWebhook),
        }}
        log={log}
      />
    </ModuleGate>
  )
}
