import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from './db'
import { reportTemplates } from './db/schema'
import { ensureSeeded } from './settings'

export interface Template {
  id: number
  name: string
  body: string
  isDefault: boolean
}

export function listTemplates(): Template[] {
  ensureSeeded()
  return db.select().from(reportTemplates).all()
}

export function getTemplate(id?: number): Template | undefined {
  const all = listTemplates()
  if (id) return all.find((t) => t.id === id) ?? all.find((t) => t.isDefault) ?? all[0]
  return all.find((t) => t.isDefault) ?? all[0]
}

export function saveTemplate(input: { id?: number; name: string; body: string }): Template {
  ensureSeeded()
  if (input.id) {
    db.update(reportTemplates)
      .set({ name: input.name, body: input.body })
      .where(eq(reportTemplates.id, input.id))
      .run()
    return getTemplate(input.id)!
  }
  const row = db
    .insert(reportTemplates)
    .values({ name: input.name, body: input.body, isDefault: false })
    .returning()
    .get()
  return row
}

export function deleteTemplate(id: number) {
  const all = listTemplates()
  // Keep at least one, and never strip the default — the report screen has to
  // have something to render.
  if (all.length <= 1) return
  const target = all.find((t) => t.id === id)
  if (!target || target.isDefault) return
  db.delete(reportTemplates).where(eq(reportTemplates.id, id)).run()
}

export function setDefaultTemplate(id: number) {
  ensureSeeded()
  db.update(reportTemplates).set({ isDefault: false }).run()
  db.update(reportTemplates).set({ isDefault: true }).where(eq(reportTemplates.id, id)).run()
}
