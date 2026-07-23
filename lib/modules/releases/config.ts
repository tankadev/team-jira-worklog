import 'server-only'

import crypto from 'node:crypto'

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'

import {
  DEFAULT_PRODUCTS,
  DEFAULT_TEAMS,
  type ProductConfig,
  type ReportExclude,
} from './model'

/**
 * Products (repos/projects) and teams are per-user config, stored in the shared
 * settings table under `mod:releases:`. A fresh install is seeded from the
 * defaults once; after that the user's own edits win, even an empty list.
 */
const PREFIX = 'mod:releases:'
const K = {
  products: `${PREFIX}products`,
  teams: `${PREFIX}teams`,
  reportExcludes: `${PREFIX}report_excludes`,
} as const

export interface ReleasesConfig {
  products: ProductConfig[]
  teams: string[]
  reportExcludes: ReportExclude[]
}

function getRaw(key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value
}

function setRaw(key: string, value: string) {
  const stamp = Math.floor(Date.now() / 1000)
  db.insert(settings)
    .values({ key, value, updatedAt: stamp })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: stamp } })
    .run()
}

function parseProducts(raw: string): ProductConfig[] {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        id: String(p.id ?? ''),
        name: String(p.name ?? ''),
        environments: Array.isArray(p.environments)
          ? p.environments.map((e: unknown) => String(e)).filter(Boolean)
          : [],
        // Older rows predate this field — default to shown.
        inReport: p.inReport === undefined ? true : Boolean(p.inReport),
      }))
      .filter((p) => p.id && p.name)
  } catch {
    return []
  }
}

function parseTeams(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.map((t) => String(t)).filter(Boolean) : []
  } catch {
    return []
  }
}

function parseExcludes(raw: string): ReportExclude[] {
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((e) => e && typeof e === 'object')
      .map((e) => ({ environment: String(e.environment ?? ''), team: String(e.team ?? '') }))
      .filter((e) => e.environment && e.team)
  } catch {
    return []
  }
}

export function getReleasesConfig(): ReleasesConfig {
  // Seed only when the key has never been written, so a deliberately-emptied
  // list is not re-populated on the next read.
  let pRaw = getRaw(K.products)
  if (pRaw === undefined) {
    pRaw = JSON.stringify(DEFAULT_PRODUCTS)
    setRaw(K.products, pRaw)
  }
  let tRaw = getRaw(K.teams)
  if (tRaw === undefined) {
    tRaw = JSON.stringify(DEFAULT_TEAMS)
    setRaw(K.teams, tRaw)
  }
  return {
    products: parseProducts(pRaw),
    teams: parseTeams(tRaw),
    reportExcludes: parseExcludes(getRaw(K.reportExcludes) ?? ''),
  }
}

export function setProducts(list: ProductConfig[]) {
  const clean = list
    .map((p) => ({
      id: p.id?.trim() || crypto.randomUUID(),
      name: p.name.trim(),
      environments: p.environments.map((e) => e.trim()).filter(Boolean),
      inReport: p.inReport !== false,
    }))
    .filter((p) => p.name && p.environments.length)
  setRaw(K.products, JSON.stringify(clean))
}

export function setTeams(list: string[]) {
  setRaw(K.teams, JSON.stringify(list.map((t) => t.trim()).filter(Boolean)))
}

export function setReportExcludes(list: ReportExclude[]) {
  const clean = list
    .map((e) => ({ environment: e.environment.trim(), team: e.team.trim() }))
    .filter((e) => e.environment && e.team)
  setRaw(K.reportExcludes, JSON.stringify(clean))
}
