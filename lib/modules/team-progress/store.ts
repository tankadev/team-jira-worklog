import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'

import {
  DEFAULT_ENVS,
  DEFAULT_PLATFORMS,
  DEFAULT_TEMPLATE,
  EMPTY_SELECTION,
  PHASES,
  type DailyMatch,
  type DeployEnv,
  type Phase,
  type PlatformAlias,
  type Selection,
} from './model'

/**
 * Everything the module keeps, as JSON under `mod:team-progress:` in the shared
 * settings table — the same arrangement as the releases module. The issues
 * themselves are never stored: Jira stays the source of truth, and what lives
 * here is only what Jira has nowhere to hold — which boxes the user ticked,
 * their notes, their templates, and the report text they edited.
 */
const PREFIX = 'mod:team-progress:'

function getRaw(key: string): string | undefined {
  return db.select().from(settings).where(eq(settings.key, PREFIX + key)).get()?.value
}

function setRaw(key: string, value: string) {
  const stamp = Math.floor(Date.now() / 1000)
  db.insert(settings)
    .values({ key: PREFIX + key, value, updatedAt: stamp })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: stamp } })
    .run()
}

function readJson<T>(key: string, fallback: T, clean: (raw: unknown) => T): T {
  const raw = getRaw(key)
  if (raw === undefined) return fallback
  try {
    return clean(JSON.parse(raw))
  } catch {
    return fallback
  }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [])
const record = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, String(x ?? '')]))
    : {}
/** Platform names travel in keys; keep them to something a key can hold. */
const slot = (platform: string) => platform.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'default'

/* ── config ─────────────────────────────────────────────────────────────── */

export interface TeamProgressConfig {
  platforms: PlatformAlias[]
  envs: DeployEnv[]
  /** `owner/repo`, the repos whose merged PRs fill the deploy section. */
  repos: string[]
  /** Past reports pasted in so the AI writes in the same voice. */
  examples: string
}

export function getConfig(): TeamProgressConfig {
  return {
    platforms: readJson('platforms', DEFAULT_PLATFORMS, (v) =>
      Array.isArray(v)
        ? v
            .map((p) => ({ platform: String(p?.platform ?? '').trim(), aliases: strings(p?.aliases).map((a) => a.trim()) }))
            .filter((p) => p.platform)
        : DEFAULT_PLATFORMS,
    ),
    envs: readJson('envs', DEFAULT_ENVS, (v) =>
      Array.isArray(v)
        ? v
            .map((e) => ({
              label: String(e?.label ?? '').trim(),
              branch: String(e?.branch ?? '').trim(),
              statusToken: String(e?.statusToken ?? '').trim(),
            }))
            .filter((e) => e.label)
        : DEFAULT_ENVS,
    ),
    repos: readJson('repos', [] as string[], strings),
    examples: getRaw('examples') ?? '',
  }
}

export function saveConfig(c: TeamProgressConfig) {
  setRaw('platforms', JSON.stringify(c.platforms))
  setRaw('envs', JSON.stringify(c.envs))
  setRaw('repos', JSON.stringify(c.repos))
  setRaw('examples', c.examples)
}

/* ── templates ──────────────────────────────────────────────────────────── */

export interface ProgressTemplate {
  id: string
  name: string
  body: string
  isDefault: boolean
}

const SEED_TEMPLATES: ProgressTemplate[] = [{ id: 'default', name: 'Mặc định', body: DEFAULT_TEMPLATE, isDefault: true }]

export function listTemplates(): ProgressTemplate[] {
  const list = readJson('templates', SEED_TEMPLATES, (v) =>
    Array.isArray(v)
      ? v
          .map((t) => ({
            id: String(t?.id ?? ''),
            name: String(t?.name ?? '').trim(),
            body: String(t?.body ?? ''),
            isDefault: Boolean(t?.isDefault),
          }))
          .filter((t) => t.id && t.name)
      : SEED_TEMPLATES,
  )
  if (!list.length) return SEED_TEMPLATES
  // Exactly one default, whatever was stored.
  const def = list.find((t) => t.isDefault) ?? list[0]
  return list.map((t) => ({ ...t, isDefault: t.id === def.id }))
}

export function saveTemplates(list: ProgressTemplate[]) {
  setRaw('templates', JSON.stringify(list))
}

/* ── per-platform state ─────────────────────────────────────────────────── */

export function getSelection(platform: string): Selection {
  const phaseIds = new Set(PHASES.map((p) => p.id))
  return readJson(`selection:${slot(platform)}`, EMPTY_SELECTION, (v) => {
    const o = (v ?? {}) as Record<string, unknown>
    return {
      selected: strings(o.selected),
      seen: strings(o.seen),
      phases: Object.fromEntries(
        Object.entries(record(o.phases)).filter(([, p]) => phaseIds.has(p as Phase)),
      ) as Record<string, Phase>,
      notes: record(o.notes),
      names: record(o.names),
    }
  })
}

export function saveSelection(platform: string, s: Selection) {
  setRaw(`selection:${slot(platform)}`, JSON.stringify(s))
}

export interface ReportDraft {
  /** YYYY-MM-DD the draft was written for. */
  date: string
  text: string
  /** What the text was built from, so edits can be checked against it. */
  baseline: string
  source: 'template' | 'ai'
}

export function getDraft(platform: string): ReportDraft | null {
  return readJson(`draft:${slot(platform)}`, null as ReportDraft | null, (v) => {
    const o = (v ?? {}) as Record<string, unknown>
    if (typeof o.text !== 'string') return null
    return {
      date: String(o.date ?? ''),
      text: o.text,
      baseline: String(o.baseline ?? ''),
      source: o.source === 'ai' ? 'ai' : 'template',
    }
  })
}

export function saveDraft(platform: string, d: ReportDraft) {
  setRaw(`draft:${slot(platform)}`, JSON.stringify(d))
}

export interface SentReport {
  date: string
  text: string
}

const HISTORY_KEEP = 15

export function getHistory(platform: string): SentReport[] {
  return readJson(`history:${slot(platform)}`, [] as SentReport[], (v) =>
    Array.isArray(v)
      ? v.map((r) => ({ date: String(r?.date ?? ''), text: String(r?.text ?? '') })).filter((r) => r.text)
      : [],
  )
}

/** Records a copied report. One per day: copying again replaces that day's. */
export function addHistory(platform: string, r: SentReport) {
  const list = [r, ...getHistory(platform).filter((x) => x.date !== r.date)].slice(0, HISTORY_KEEP)
  setRaw(`history:${slot(platform)}`, JSON.stringify(list))
}

/**
 * The team's daily reports for one day, pasted in as they came from chat.
 * Kept per day: yesterday's paste has nothing to say about today's report.
 */
export interface DailiesPaste {
  date: string
  text: string
}

export function getDailies(platform: string): DailiesPaste | null {
  return readJson(`dailies:${slot(platform)}`, null as DailiesPaste | null, (v) => {
    const o = (v ?? {}) as Record<string, unknown>
    return typeof o.text === 'string' ? { date: String(o.date ?? ''), text: o.text } : null
  })
}

export function saveDailies(platform: string, d: DailiesPaste) {
  setRaw(`dailies:${slot(platform)}`, JSON.stringify(d))
}

/**
 * The AI's line-by-line matching of a day's dailies to issues. Tied to the
 * exact text it was made from, so editing the paste invalidates it rather
 * than leaving matches that point at lines no longer there.
 */
export interface DailyMap {
  date: string
  /** The pasted text the matches were made from. */
  source: string
  matches: DailyMatch[]
}

export function getDailyMap(platform: string): DailyMap | null {
  return readJson(`daily-map:${slot(platform)}`, null as DailyMap | null, (v) => {
    const o = (v ?? {}) as Record<string, unknown>
    if (!Array.isArray(o.matches)) return null
    return {
      date: String(o.date ?? ''),
      source: String(o.source ?? ''),
      matches: (o.matches as Array<Record<string, unknown>>).map((m) => ({
        person: String(m.person ?? ''),
        when: m.when === 'yesterday' || m.when === 'today' ? m.when : 'other',
        line: String(m.line ?? ''),
        key: typeof m.key === 'string' ? m.key : null,
        subtaskKey: typeof m.subtaskKey === 'string' ? m.subtaskKey : null,
        reason: String(m.reason ?? ''),
      })),
    }
  })
}

export function saveDailyMap(platform: string, m: DailyMap) {
  setRaw(`daily-map:${slot(platform)}`, JSON.stringify(m))
}

export function getLastPlatform(): string | null {
  return getRaw('last-platform') ?? null
}

export function setLastPlatform(platform: string) {
  setRaw('last-platform', platform)
}
