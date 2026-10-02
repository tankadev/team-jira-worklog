'use client'

import { createContext, useContext, useLayoutEffect, useState } from 'react'

import { Icon, type IconName } from '../icons'

/**
 * The settings page, one group at a time.
 *
 * Every panel stays mounted and inactive ones are only `hidden`: the Jira, AI,
 * hours and point fields all belong to one <form>, and a field that is not in
 * the DOM is not submitted — saving from one tab would then quietly blank the
 * others. Hidden inputs are still sent.
 */
export const SETTINGS_TABS = [
  { id: 'connection', label: 'Kết nối Jira', icon: 'kanban', form: true, sections: ['jira', 'team'] },
  { id: 'integrations', label: 'AI & GitHub', icon: 'pull-request', form: true, sections: ['gemini', 'github'] },
  { id: 'hours', label: 'Giờ làm việc', icon: 'clipboard-list', form: true, sections: ['schedule'] },
  { id: 'points', label: 'Point & sprint', icon: 'chart-line', form: true, sections: ['sprint-prefix'] },
  { id: 'modules', label: 'Modules', icon: 'puzzle', form: false, sections: [] },
  { id: 'templates', label: 'Template', icon: 'square-pen', form: false, sections: [] },
] as const satisfies ReadonlyArray<{
  id: string
  label: string
  icon: IconName
  form: boolean
  /** Old per-card anchors (`/settings#jira`) that should still land on the right tab. */
  sections: readonly string[]
}>

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id']

const TabContext = createContext<SettingsTabId>('connection')

function tabFromHash(hash: string): SettingsTabId | null {
  const key = hash.replace(/^#/, '')
  const tab = SETTINGS_TABS.find((t) => t.id === key || (t.sections as readonly string[]).includes(key))
  return tab?.id ?? null
}

export function SettingsTabs({
  actions,
  children,
}: {
  /** Pinned to the right end of the tab bar — never moves when the tab or the page below changes. */
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const [active, setActive] = useState<SettingsTabId>('connection')

  // The tab lives in the hash so a reload, or a link like /settings#modules,
  // opens where it should. Read after mount — the server cannot see the hash —
  // but before paint, so the first tab never flashes up before the right one.
  useLayoutEffect(() => {
    const sync = () => {
      const tab = tabFromHash(window.location.hash)
      if (tab) setActive(tab)
    }
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  // On a phone the row scrolls sideways; keep the chosen tab in sight, e.g.
  // after opening /settings#templates, whose tab starts off-screen.
  useLayoutEffect(() => {
    document.getElementById(`tab-${active}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])

  function select(id: SettingsTabId) {
    setActive(id)
    history.replaceState(null, '', `#${id}`)
  }

  return (
    <TabContext.Provider value={active}>
      <div className="sticky top-[104px] z-20 -mx-1 mb-5 flex items-center gap-1 rounded-xl border border-line bg-surface/90 p-1 shadow-card backdrop-blur md:top-3">
        <div
          role="tablist"
          aria-label="Nhóm settings"
          className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]"
        >
          {SETTINGS_TABS.map((tab) => {
            const selected = tab.id === active
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={selected}
                aria-controls={`panel-${tab.id}`}
                onClick={() => select(tab.id)}
                className={
                  'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-small font-medium transition-colors ' +
                  (selected
                    ? 'bg-accent-soft font-semibold text-accent-ink'
                    : 'text-ink-2 hover:bg-surface-2 hover:text-ink')
                }
              >
                <Icon name={tab.icon} className={'size-4 shrink-0 ' + (selected ? 'text-accent' : 'text-ink-3')} />
                {tab.label}
              </button>
            )
          })}
        </div>
        {actions}
      </div>
      {children}
    </TabContext.Provider>
  )
}

export function TabPanel({
  id,
  className,
  children,
}: {
  id: SettingsTabId
  className?: string
  children: React.ReactNode
}) {
  const active = useContext(TabContext)
  return (
    <div
      role="tabpanel"
      id={`panel-${id}`}
      aria-labelledby={`tab-${id}`}
      hidden={active !== id}
      className={className}
    >
      {children}
    </div>
  )
}

/** Whether the tab on screen edits fields of the shared settings form — the save bar only makes sense there. */
export function useActiveTabIsForm() {
  const active = useContext(TabContext)
  return SETTINGS_TABS.find((t) => t.id === active)?.form ?? false
}
