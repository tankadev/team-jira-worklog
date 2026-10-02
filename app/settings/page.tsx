import { connection } from 'next/server'

import { listModuleStates } from '@/lib/modules/state'
import { getSettingsForClient } from '@/lib/settings'
import { listPrefixes } from '@/lib/drafts'
import { listTemplates } from '@/lib/templates'

import { SaveSettingsButton, SettingsForm, SettingsSaveProvider } from './form'
import { ModuleManager } from './modules'
import { PrefixManager } from './prefixes'
import { SettingsTabs, TabPanel } from './tabs'
import { TemplateManager } from './templates'

/**
 * `connection()` before the synchronous SQLite read. better-sqlite3 is sync, so
 * without this the query could resolve during prerender and bake stale settings
 * into the page — the one thing a settings screen must never do.
 */
export default async function SettingsPage() {
  await connection()
  const settings = getSettingsForClient()
  const templates = listTemplates()
  const prefixes = listPrefixes()
  const moduleStates = listModuleStates()

  return (
    <>
      <header className="mb-4">
        <div className="eyebrow text-ink-2">
          Lưu local trong SQLite · không rời máy bạn
        </div>
        <h1 className="text-title font-semibold tracking-tight">Settings</h1>
      </header>

      {/* The page ran to a dozen panels; each group now gets a tab of its own. */}
      <SettingsSaveProvider>
        <SettingsTabs actions={<SaveSettingsButton />}>
          <SettingsForm initial={settings} />

          <TabPanel id="modules">
            <ModuleManager states={moduleStates} />
          </TabPanel>

          <TabPanel
            id="templates"
            className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"
          >
            <TemplateManager
              initial={templates.map((t) => ({
                id: t.id,
                name: t.name,
                body: t.body,
                isDefault: t.isDefault,
              }))}
            />
            <PrefixManager initial={prefixes} />
          </TabPanel>
        </SettingsTabs>
      </SettingsSaveProvider>
    </>
  )
}
