import 'server-only'

import { desc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { releaseTasks } from '@/lib/db/schema'

import type { ReleaseTaskShape } from './model'

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
