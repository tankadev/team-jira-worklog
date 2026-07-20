import { connection } from 'next/server'

import { getSettingsForClient } from '@/lib/settings'
import { listPrefixes } from '@/lib/drafts'
import { listTemplates } from '@/lib/templates'

import { SettingsForm } from './form'
import { PrefixManager } from './prefixes'
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

  return (
    <>
      <header className="mb-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
          Lưu local trong SQLite · không rời máy bạn
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      </header>

      <SettingsForm initial={settings} />

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <TemplateManager
          initial={templates.map((t) => ({
            id: t.id,
            name: t.name,
            body: t.body,
            isDefault: t.isDefault,
          }))}
        />
        <PrefixManager initial={prefixes} />
      </div>
    </>
  )
}
