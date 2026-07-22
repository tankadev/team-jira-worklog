import 'server-only'

import crypto from 'node:crypto'

import { inArray } from 'drizzle-orm'

import { db } from '@/lib/db'
import { settings } from '@/lib/db/schema'

/**
 * App Store Connect config for the module, stored in the shared settings table
 * under a `mod:ios-publish:` namespace so the module owns its keys without
 * touching the core SETTING_KEYS enum.
 *
 * Two saved lists:
 *  - profiles: ASC credential sets, one per account/team (the original TAKAI and
 *    VIPTALK keys).
 *  - apps: presets holding the parts that stay put — app name, default version,
 *    which profile, external group(s), notify rooms. Publishing only needs the
 *    build number and the "What to Test" text on top of a preset.
 */
const PREFIX = 'mod:ios-publish:'
const K = {
  profiles: `${PREFIX}profiles`,
  apps: `${PREFIX}apps`,
  chatWebhook: `${PREFIX}chat_webhook`,
  chatTemplate: `${PREFIX}chat_template`,
} as const

export interface AscCredentials {
  issuerId: string
  keyId: string
  p8Key: string
}

/** A named ASC credential set. */
export interface AscProfile extends AscCredentials {
  id: string
  name: string
}

/** Client-facing view of a profile — never carries the private key. */
export interface ProfileView {
  id: string
  name: string
  issuerId: string
  keyId: string
  hasP8: boolean
}

/** Everything about an app that stays put between builds. */
export interface AppPreset {
  id: string
  /** App name exactly as it reads on App Store Connect. */
  name: string
  /** Which ASC credential profile this app publishes through. */
  profileId: string
  /** Default marketing version (editable at publish time). */
  version: string
  /** External testing groups; an app may have more than one. */
  groups: string[]
  /** Comma-separated room ids the build announcement goes to. */
  roomIds: string
}

export interface IosConfig {
  profiles: AscProfile[]
  apps: AppPreset[]
  chatWebhook: string
  chatTemplate: string
}

export function toProfileView(p: AscProfile): ProfileView {
  return { id: p.id, name: p.name, issuerId: p.issuerId, keyId: p.keyId, hasP8: Boolean(p.p8Key) }
}

function parseArray<T>(raw: string, map: (v: Record<string, unknown>) => T): T[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((v) => v && typeof v === 'object').map(map)
  } catch {
    return []
  }
}

function parseProfiles(raw: string): AscProfile[] {
  return parseArray(raw, (p) => ({
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    issuerId: String(p.issuerId ?? ''),
    keyId: String(p.keyId ?? ''),
    p8Key: String(p.p8Key ?? ''),
  })).filter((p) => p.id)
}

function parseApps(raw: string): AppPreset[] {
  return parseArray(raw, (a) => ({
    id: String(a.id ?? ''),
    name: String(a.name ?? ''),
    profileId: String(a.profileId ?? ''),
    version: String(a.version ?? ''),
    groups: Array.isArray(a.groups) ? a.groups.map((g) => String(g)).filter(Boolean) : [],
    roomIds: String(a.roomIds ?? ''),
  })).filter((a) => a.id)
}

function setRaw(key: string, value: string) {
  const stamp = Math.floor(Date.now() / 1000)
  db.insert(settings)
    .values({ key, value, updatedAt: stamp })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: stamp } })
    .run()
}

export function getIosConfig(): IosConfig {
  const rows = db
    .select()
    .from(settings)
    .where(inArray(settings.key, [K.profiles, K.apps, K.chatWebhook, K.chatTemplate]))
    .all()
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    profiles: parseProfiles(map.get(K.profiles) ?? ''),
    apps: parseApps(map.get(K.apps) ?? ''),
    chatWebhook: map.get(K.chatWebhook) ?? '',
    chatTemplate: map.get(K.chatTemplate) ?? '',
  }
}

// ── profiles ──────────────────────────────────────────────────────────────

export function listProfiles(): AscProfile[] {
  return getIosConfig().profiles
}

export function getProfile(id: string): AscProfile | undefined {
  return listProfiles().find((p) => p.id === id)
}

/**
 * Upserts a profile. On edit, a blank p8 means "unchanged" so the stored key is
 * kept; a new profile gets a generated id.
 */
export function saveAscProfile(input: {
  id?: string
  name: string
  issuerId: string
  keyId: string
  p8Key: string
}): AscProfile {
  const list = listProfiles()

  if (input.id) {
    const idx = list.findIndex((p) => p.id === input.id)
    if (idx === -1) throw new Error('Không thấy cấu hình để sửa')
    const existing = list[idx]
    const updated: AscProfile = {
      id: existing.id,
      name: input.name.trim() || existing.name,
      issuerId: input.issuerId.trim(),
      keyId: input.keyId.trim(),
      p8Key: input.p8Key.trim() || existing.p8Key,
    }
    list[idx] = updated
    setRaw(K.profiles, JSON.stringify(list))
    return updated
  }

  const created: AscProfile = {
    id: crypto.randomUUID(),
    name: input.name.trim() || 'ASC',
    issuerId: input.issuerId.trim(),
    keyId: input.keyId.trim(),
    p8Key: input.p8Key.trim(),
  }
  setRaw(K.profiles, JSON.stringify([...list, created]))
  return created
}

export function deleteAscProfile(id: string) {
  setRaw(K.profiles, JSON.stringify(listProfiles().filter((p) => p.id !== id)))
}

// ── app presets ─────────────────────────────────────────────────────────────

export function listApps(): AppPreset[] {
  return getIosConfig().apps
}

export function getAppPreset(id: string): AppPreset | undefined {
  return listApps().find((a) => a.id === id)
}

export function saveAppPreset(input: {
  id?: string
  name: string
  profileId: string
  version: string
  groups: string[]
  roomIds: string
}): AppPreset {
  const list = listApps()
  const clean = {
    name: input.name.trim(),
    profileId: input.profileId,
    version: input.version.trim(),
    groups: input.groups.map((g) => g.trim()).filter(Boolean),
    roomIds: input.roomIds.trim(),
  }

  if (input.id) {
    const idx = list.findIndex((a) => a.id === input.id)
    if (idx === -1) throw new Error('Không thấy app để sửa')
    list[idx] = { id: input.id, ...clean }
    setRaw(K.apps, JSON.stringify(list))
    return list[idx]
  }

  const created: AppPreset = { id: crypto.randomUUID(), ...clean }
  setRaw(K.apps, JSON.stringify([...list, created]))
  return created
}

export function deleteAppPreset(id: string) {
  setRaw(K.apps, JSON.stringify(listApps().filter((a) => a.id !== id)))
}

// ── notify ───────────────────────────────────────────────────────────────────

export function setNotifyConfig(patch: { chatWebhook?: string; chatTemplate?: string }) {
  if (patch.chatWebhook !== undefined) setRaw(K.chatWebhook, patch.chatWebhook.trim())
  if (patch.chatTemplate !== undefined) setRaw(K.chatTemplate, patch.chatTemplate)
}

/** Configured once at least one profile carries a full credential set. */
export function isIosConfigured(): boolean {
  return listProfiles().some((p) => p.issuerId && p.keyId && p.p8Key)
}
