import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { moduleState } from '@/lib/db/schema'

import { MODULES, type ModuleId } from './registry'

/** Enabled flag for every module id, defaulting missing rows to off. */
export function listModuleStates(): Record<string, boolean> {
  const rows = db.select().from(moduleState).all()
  const map: Record<string, boolean> = {}
  for (const m of MODULES) map[m.id] = false
  for (const r of rows) map[r.moduleId] = r.enabled
  return map
}

export function isModuleEnabled(id: ModuleId): boolean {
  const row = db.select().from(moduleState).where(eq(moduleState.moduleId, id)).get()
  return row?.enabled ?? false
}

export function setModuleEnabled(id: ModuleId, enabled: boolean) {
  const enabledAt = enabled ? Math.floor(Date.now() / 1000) : null
  db.insert(moduleState)
    .values({ moduleId: id, enabled, enabledAt })
    .onConflictDoUpdate({ target: moduleState.moduleId, set: { enabled, enabledAt } })
    .run()
}

/** Nav entries for the modules currently switched on, in manifest order. */
export function enabledModuleNav(): Array<{ href: string; label: string }> {
  const states = listModuleStates()
  return MODULES.filter((m) => states[m.id]).map((m) => m.nav)
}
