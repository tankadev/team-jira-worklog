import { connection } from 'next/server'

import { ModuleGate } from '@/lib/modules/gate'
import { getIosConfig, isIosConfigured, toProfileView } from '@/lib/modules/ios-publish/config'
import { listIosLog } from '@/lib/modules/ios-publish/store'
import { getReleasesConfig } from '@/lib/modules/releases/config'
import { renderBuiltForApp, renderBuiltTasksByTeam } from '@/lib/modules/releases/model'
import { listReleaseTasks } from '@/lib/modules/releases/store'

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

  // "What to Test" seeds from the releases module's "đã build" tasks. Each app
  // maps to a product + environment, so its seed is scoped to that slice; an
  // app with no mapping falls back to every built task.
  const tasks = listReleaseTasks()
  const products = getReleasesConfig().products
  const envByProduct = new Map(products.map((p) => [p.name, p.environments]))
  const suggestions: Record<string, string> = {}
  for (const app of cfg.apps) {
    suggestions[app.id] = app.product
      ? renderBuiltForApp(tasks, app.product, app.environment, envByProduct.get(app.product) ?? [])
      : renderBuiltTasksByTeam(tasks)
  }
  const releaseProducts = products.map((p) => ({ name: p.name, environments: p.environments }))

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
        suggestions={suggestions}
        releaseProducts={releaseProducts}
      />
    </ModuleGate>
  )
}
