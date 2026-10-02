import { connection } from 'next/server'

import { listModuleStates } from '@/lib/modules/state'
import { getSettingsForClient } from '@/lib/settings'
import { listPrefixes } from '@/lib/drafts'
import { listTemplates } from '@/lib/templates'

import { SettingsForm } from './form'
import { ModuleManager } from './modules'
import { PrefixManager } from './prefixes'
import { TemplateManager } from './templates'

/**
 * `connection()` before the synchronous SQLite read. better-sqlite3 is sync, so
 * without this the query could resolve during prerender and bake stale settings
 * into the page — the one thing a settings screen must never do.
 */
const SECTIONS = [
  ['#jira', 'Kết nối Jira'],
  ['#team', 'Team'],
  ['#gemini', 'Gemini'],
  ['#github', 'GitHub'],
  ['#hours', 'Quy tắc giờ'],
  ['#schedule', 'Giờ làm việc'],
  ['#points', 'Point'],
  ['#modules', 'Modules'],
  ['#templates', 'Template & tiền tố'],
] as const

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

      {/* The page runs to a dozen panels; this is the way to them without
          scrolling past everything in between. */}
      <nav className="sticky top-[118px] z-20 -mx-1 mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface/90 p-1 shadow-card backdrop-blur [scrollbar-width:none] md:top-3">
        {SECTIONS.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-small font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            {label}
          </a>
        ))}
      </nav>

      <SettingsForm initial={settings} />

      <div id="modules" className="mt-5 scroll-mt-20">
        <ModuleManager states={moduleStates} />
      </div>

      <div id="templates" className="mt-5 grid scroll-mt-20 grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
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
