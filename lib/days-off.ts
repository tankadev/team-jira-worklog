import 'server-only'

import { and, gte, lte } from 'drizzle-orm'
import { eq } from 'drizzle-orm'

import { db } from './db'
import { daysOff } from './db/schema'
import type { DayOffKind } from './quota'

/** Leave marked between two dates, as a date → kind map. */
export function listDaysOff(from: string, to: string): Record<string, DayOffKind> {
  const rows = db
    .select()
    .from(daysOff)
    .where(and(gte(daysOff.date, from), lte(daysOff.date, to)))
    .all()

  const out: Record<string, DayOffKind> = {}
  for (const r of rows) out[r.date] = r.kind as DayOffKind
  return out
}

/** Passing `null` clears the mark. */
export function setDayOff(date: string, kind: DayOffKind | null) {
  if (!kind) {
    db.delete(daysOff).where(eq(daysOff.date, date)).run()
    return
  }
  db.insert(daysOff)
    .values({ date, kind })
    .onConflictDoUpdate({ target: daysOff.date, set: { kind } })
    .run()
}
