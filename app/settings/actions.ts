'use server'

import { revalidatePath } from 'next/cache'

import { getMyself } from '@/lib/jira/client'
import { SETTING_KEYS, getSetting, setSettings } from '@/lib/settings'

/** Placeholder the server sends instead of a stored secret; means "unchanged". */
const MASK_PREFIX = '••••'

export interface SaveResult {
  ok: boolean
  message: string
}

export async function saveSettings(_prev: SaveResult | null, formData: FormData): Promise<SaveResult> {
  const entries: Record<string, string> = {}

  for (const [key, raw] of formData.entries()) {
    if (typeof raw !== 'string') continue
    if (!Object.values(SETTING_KEYS).includes(key as never)) continue
    // A masked secret means the user did not retype it — keep what is stored.
    if (raw.startsWith(MASK_PREFIX)) continue
    entries[key] = raw.trim()
  }

  // An unchecked checkbox submits nothing, so absence has to mean false.
  entries[SETTING_KEYS.weekendCountsToQuota] = formData.has(SETTING_KEYS.weekendCountsToQuota)
    ? 'true'
    : 'false'

  try {
    setSettings(entries)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được settings' }
  }

  revalidatePath('/settings')
  return { ok: true, message: 'Đã lưu settings' }
}

export interface TestResult {
  ok: boolean
  message: string
  detail?: string
}

/**
 * Tests whatever is currently stored, so it reflects the saved state rather than
 * unsaved form input. Read-only — GET /myself creates nothing.
 */
export async function testJiraConnection(): Promise<TestResult> {
  const baseUrl = getSetting(SETTING_KEYS.jiraBaseUrl)
  if (!baseUrl) return { ok: false, message: 'Chưa điền Jira base URL' }

  try {
    const me = await getMyself()
    return {
      ok: true,
      message: `Kết nối OK · ${me.displayName}`,
      detail: [me.emailAddress, me.timeZone].filter(Boolean).join(' · '),
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không kết nối được Jira',
    }
  }
}

export async function testGeminiConnection(): Promise<TestResult> {
  const key = getSetting(SETTING_KEYS.googleApiKey)
  const model = getSetting(SETTING_KEYS.geminiModel) ?? 'gemini-2.5-flash'
  if (!key) return { ok: false, message: 'Chưa điền Google API key' }

  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
      headers: { 'x-goog-api-key': key },
      cache: 'no-store',
    })
    const body = (await res.json().catch(() => null)) as
      | { models?: Array<{ name?: string }>; error?: { message?: string; status?: string } }
      | null

    if (!res.ok) {
      return { ok: false, message: body?.error?.message ?? `Google trả về HTTP ${res.status}` }
    }

    const names = (body?.models ?? []).map((m) => m.name?.split('/').pop()).filter(Boolean)
    const hasModel = names.includes(model)
    return {
      ok: hasModel,
      message: hasModel ? `Kết nối OK · ${model}` : `Key hợp lệ nhưng không thấy model ${model}`,
      detail: `${names.length} model khả dụng`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không gọi được Google API' }
  }
}
