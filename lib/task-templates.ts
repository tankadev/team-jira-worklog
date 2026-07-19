import 'server-only'

import { desc, eq, sql } from 'drizzle-orm'

import { db } from './db'
import { taskTemplates } from './db/schema'
import { ensureSeeded } from './settings'

export interface TaskTemplateInput {
  id?: number
  name: string
  title: string
  description: string
  dod: string
  prefixes: string[]
  issueTypeId?: string | null
  storyPoints?: number | null
}

/**
 * Templates deliberately store no parent and no sprint.
 *
 * That is the whole point: the same recurring task attaches to a different
 * parent each sprint. Storing either would make the template wrong the moment
 * the sprint rolls over. The sprint prefix also stays out of the saved title —
 * it is derived from whichever sprint is current when the template is used.
 */
export function listTaskTemplates() {
  ensureSeeded()
  return db
    .select()
    .from(taskTemplates)
    .orderBy(desc(taskTemplates.useCount), desc(taskTemplates.id))
    .all()
}

export function getTaskTemplate(id: number) {
  return db.select().from(taskTemplates).where(eq(taskTemplates.id, id)).get()
}

export function saveTaskTemplate(input: TaskTemplateInput) {
  ensureSeeded()
  const values = {
    name: input.name,
    title: input.title,
    description: input.description,
    dod: input.dod,
    prefixes: JSON.stringify(input.prefixes),
    issueTypeId: input.issueTypeId ?? null,
    storyPoints: input.storyPoints ?? null,
  }

  if (input.id) {
    db.update(taskTemplates).set(values).where(eq(taskTemplates.id, input.id)).run()
    return getTaskTemplate(input.id)!
  }
  return db.insert(taskTemplates).values(values).returning().get()
}

export function deleteTaskTemplate(id: number) {
  db.delete(taskTemplates).where(eq(taskTemplates.id, id)).run()
}

/** Bumps usage so the most-used templates float to the top of the picker. */
export function markTemplateUsed(id: number) {
  db.update(taskTemplates)
    .set({
      useCount: sql`${taskTemplates.useCount} + 1`,
      lastUsedAt: sql`(strftime('%s','now'))`,
    })
    .where(eq(taskTemplates.id, id))
    .run()
}
