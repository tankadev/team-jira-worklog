import { SETTING_KEYS, getSetting } from '@/lib/settings'

export const runtime = 'nodejs'

/**
 * Models this API key can actually call.
 *
 * Google's catalogue endpoint lists models that are visible but closed to new
 * users — `gemini-2.5-flash` returns 404 on use while still appearing in the
 * list. So the names here are a starting point, not a guarantee; the Settings
 * field stays free text for that reason.
 */
export async function GET() {
  const key = getSetting(SETTING_KEYS.googleApiKey)
  if (!key) return Response.json({ error: 'Chưa có Google API key' }, { status: 400 })

  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
      { headers: { 'x-goog-api-key': key }, cache: 'no-store' },
    )
    const body = (await res.json()) as {
      models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }>
      error?: { message?: string }
    }

    if (!res.ok) {
      return Response.json({ error: body?.error?.message ?? `HTTP ${res.status}` }, { status: 502 })
    }

    const models = (body.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => ({ id: m.name?.split('/').pop() ?? '', name: m.displayName ?? '' }))
      .filter((m) => m.id && !/tts|image|embedding|vision|lyria|veo/i.test(m.id))

    return Response.json({ current: getSetting(SETTING_KEYS.geminiModel), models })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không gọi được Google API' },
      { status: 500 },
    )
  }
}
