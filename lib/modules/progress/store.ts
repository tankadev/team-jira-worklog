import 'server-only'

import { asc, desc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { progressItems, progressReports } from '@/lib/db/schema'

import type { ProgressItem } from './format'

export interface ProgressReportRow {
  id: number
  member: string
  items: ProgressItem[]
}

export interface SaveProgressInput {
  id?: number
  member: string
  reportDate: string
  items: ProgressItem[]
}

/**
 * The single living progress sheet.
 *
 * The report is not a per-day archive — the user updates the same feature list
 * every day and deletes a feature once it ships — so there is only ever one row
 * to carry forward. Returns the most recently saved one, or null before the
 * first save.
 */
export function getProgressReport(): ProgressReportRow | null {
  const r = db.select().from(progressReports).orderBy(desc(progressReports.updatedAt)).get()
  if (!r) return null
  return {
    id: r.id,
    member: r.member,
    items: db
      .select()
      .from(progressItems)
      .where(eq(progressItems.reportId, r.id))
      .orderBy(asc(progressItems.position))
      .all()
      .map((it) => ({
        prefix: it.prefix,
        feature: it.feature,
        document: it.document,
        implement: it.implement,
        fix: it.fix,
      })),
  }
}

/**
 * Upserts the sheet and replaces its items wholesale. Rewriting the item rows
 * rather than diffing them is fine at this scale — a sheet holds a handful of
 * lines — and keeps their stored order exactly matching the editor.
 */
export function saveProgressReport(input: SaveProgressInput): number {
  const stamp = sql`(strftime('%s','now'))` as unknown as number
  let id = input.id

  if (id) {
    db.update(progressReports)
      .set({ member: input.member, reportDate: input.reportDate, updatedAt: stamp })
      .where(eq(progressReports.id, id))
      .run()
    db.delete(progressItems).where(eq(progressItems.reportId, id)).run()
  } else {
    const row = db
      .insert(progressReports)
      .values({ member: input.member, reportDate: input.reportDate })
      .returning()
      .get()
    id = row.id
  }

  if (input.items.length) {
    db.insert(progressItems)
      .values(
        input.items.map((it, i) => ({
          reportId: id!,
          prefix: it.prefix,
          feature: it.feature,
          document: it.document,
          implement: it.implement,
          fix: it.fix,
          position: i,
        })),
      )
      .run()
  }

  return id
}
