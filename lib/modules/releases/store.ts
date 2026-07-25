import 'server-only'

import { desc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { releaseTasks } from '@/lib/db/schema'

import { BUILT_STATUS, REPORTED_STATUS, type ReleaseTaskShape } from './model'

export interface ReleaseTaskRow extends ReleaseTaskShape {
  id: number
}

function parseSub(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : []
  } catch {
    return []
  }
}

export function listReleaseTasks(): ReleaseTaskRow[] {
  return db
    .select()
    .from(releaseTasks)
    .orderBy(desc(releaseTasks.updatedAt))
    .all()
    .map((r) => ({
      id: r.id,
      taskId: r.taskId,
      description: r.description,
      branchName: r.branchName,
      subTasks: parseSub(r.subTasks),
      product: r.product,
      team: r.team,
      environment: r.environment,
      buildStatus: r.buildStatus,
      noBranch: r.noBranch,
      refId: r.refId,
    }))
}

export function saveReleaseTask(input: ReleaseTaskShape & { id?: number }): number {
  const stamp = sql`(strftime('%s','now'))` as unknown as number
  const values = {
    taskId: input.taskId,
    description: input.description,
    branchName: input.branchName,
    subTasks: JSON.stringify(input.subTasks),
    product: input.product,
    team: input.team,
    environment: input.environment,
    buildStatus: input.buildStatus,
    noBranch: input.noBranch,
    refId: input.refId,
    updatedAt: stamp,
  }

  if (input.id) {
    db.update(releaseTasks).set(values).where(eq(releaseTasks.id, input.id)).run()
    return input.id
  }
  return db.insert(releaseTasks).values(values).returning({ id: releaseTasks.id }).get().id
}

/** Quick edits from the board card — moving column or flipping build status. */
export function patchReleaseTask(id: number, patch: { environment?: string; buildStatus?: string }) {
  const set: Record<string, unknown> = { updatedAt: sql`(strftime('%s','now'))` }
  if (patch.environment !== undefined) set.environment = patch.environment
  if (patch.buildStatus !== undefined) set.buildStatus = patch.buildStatus
  db.update(releaseTasks).set(set).where(eq(releaseTasks.id, id)).run()
}

export function deleteReleaseTask(id: number) {
  db.delete(releaseTasks).where(eq(releaseTasks.id, id)).run()
}

/** Whether `token` appears in `text` as a standalone id (bounded by non-alnum). */
function mentions(text: string, token: string): boolean {
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, 'i').test(text)
}

/**
 * Promote every "đã build" task whose id is named in `text` to "đã public",
 * returning the ids moved. Called when an iOS build ships to testers — the
 * What-to-Test text lists exactly those tasks. Restricted to the "đã build"
 * stage so a stray mention can't jump a task straight from "đang PR" to public,
 * which also makes a repeat submit a no-op.
 */
export function publishBuiltTasksMentioned(text: string): string[] {
  if (!text.trim()) return []
  const promoted: string[] = []
  for (const r of listReleaseTasks()) {
    if (r.buildStatus !== BUILT_STATUS) continue
    const id = r.taskId.trim()
    if (id && mentions(text, id)) {
      patchReleaseTask(r.id, { buildStatus: REPORTED_STATUS })
      promoted.push(id)
    }
  }
  return promoted
}
