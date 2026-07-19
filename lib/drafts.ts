import 'server-only'

import { desc, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

import { db } from './db'
import { drafts, prefixes } from './db/schema'
import { ensureSeeded } from './settings'

export interface DraftInput {
  id?: number
  idea: string
  title: string
  description: string
  dod: string
  prefixes: string[]
  issueTypeId?: string | null
  parentKey?: string | null
  sprintId?: number | null
  storyPoints?: number | null
}

export function listDrafts() {
  ensureSeeded()
  return db.select().from(drafts).orderBy(desc(drafts.updatedAt)).all()
}

export function getDraft(id: number) {
  return db.select().from(drafts).where(eq(drafts.id, id)).get()
}

export function saveDraft(input: DraftInput) {
  ensureSeeded()
  const values = {
    idea: input.idea,
    title: input.title,
    description: input.description,
    dod: input.dod,
    prefixes: JSON.stringify(input.prefixes),
    issueTypeId: input.issueTypeId ?? null,
    parentKey: input.parentKey ?? null,
    sprintId: input.sprintId ?? null,
    storyPoints: input.storyPoints ?? null,
    updatedAt: sql`(strftime('%s','now'))` as unknown as number,
  }

  if (input.id) {
    db.update(drafts).set(values).where(eq(drafts.id, input.id)).run()
    return getDraft(input.id)!
  }
  return db.insert(drafts).values(values).returning().get()
}

/** Called after a draft becomes a real issue — Jira owns it from then on. */
export function deleteDraft(id: number) {
  db.delete(drafts).where(eq(drafts.id, id)).run()
}

export function listPrefixes(): string[] {
  ensureSeeded()
  return db
    .select()
    .from(prefixes)
    .orderBy(prefixes.position)
    .all()
    .map((p) => p.label)
}

export function setPrefixes(labels: string[]) {
  ensureSeeded()
  db.delete(prefixes).run()
  if (labels.length) {
    db.insert(prefixes)
      .values(labels.map((label, i) => ({ label, position: i })))
      .run()
  }
}
