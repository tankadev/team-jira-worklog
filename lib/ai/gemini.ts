import 'server-only'

import { SETTING_KEYS, getSetting } from '../settings'
import { RetryableError, parseRetryAfter, withRetry } from './retry'

export interface GeneratedTask {
  title: string
  description: string
  dod: string
  storyPoints?: number
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Attempts per model before giving up. */
const MAX_ATTEMPTS = 4

/**
 * The model is told NOT to emit prefixes. The app composes `[spt 66][Mobile]`
 * itself from the sprint and the user's chips, because a model asked to follow
 * a bracket convention will eventually produce `[mobile]` or `[Mob]` and the
 * drift is invisible until someone greps the backlog.
 */
function buildPrompt(idea: string, context: { pointRules: string; parentSummary?: string }) {
  return `Bạn là trợ lý viết task cho một team phát triển phần mềm người Việt.

Từ mô tả ngắn của lập trình viên, hãy viết:
1. title — một dòng, tiếng Việt, ngắn gọn, nêu rõ việc phải làm. KHÔNG thêm bất kỳ tiền tố nào trong ngoặc vuông.
2. description — các gạch đầu dòng mô tả công việc cần xử lý, tiếng Việt.
3. dod — Definition of Done, các gạch đầu dòng, mỗi dòng là một điều kiện kiểm chứng được.
4. storyPoints — số nguyên 1, 2 hoặc 3.

Quy tắc story point của team:
${context.pointRules}
Không có point lớn hơn 3. Việc lớn hơn phải tách thành nhiều task con.

${context.parentSummary ? `Task này là task con của: "${context.parentSummary}"\n` : ''}
Mô tả của lập trình viên:
"""
${idea}
"""

Trả về DUY NHẤT một object JSON, không kèm giải thích, không kèm markdown fence:
{"title": "...", "description": "- ...\\n- ...", "dod": "- ...\\n- ...", "storyPoints": 2}`
}

/** Models sometimes wrap JSON in a fence despite instructions; strip it. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string }
}

/** One call. Throws RetryableError for anything worth another go. */
async function callOnce(model: string, apiKey: string, prompt: string): Promise<GeneratedTask> {
  let res: Response
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    })
  } catch (error) {
    // DNS hiccups, resets, timeouts — all worth retrying.
    throw new RetryableError(error instanceof Error ? error.message : 'Không gọi được Google API')
  }

  const body = (await res.json().catch(() => null)) as GeminiResponse | null

  if (!res.ok) {
    const message = body?.error?.message ?? `Gemini trả về HTTP ${res.status}`

    // 429 quota and 503 overload are the two the free tier hits constantly, and
    // both usually clear on their own. 5xx is transient by definition.
    if (res.status === 429 || res.status === 503 || res.status >= 500) {
      throw new RetryableError(message, parseRetryAfter(res.headers.get('retry-after')))
    }

    if (res.status === 404) {
      throw new Error(
        `${message} Đổi model trong Settings — xem danh sách khả dụng tại /api/ai/models.`,
      )
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(`${message} Kiểm tra lại Google API key trong Settings.`)
    }
    throw new Error(message)
  }

  if (body?.promptFeedback?.blockReason) {
    // A content block will repeat for the same prompt, so do not retry it.
    throw new Error(`Gemini từ chối nội dung (${body.promptFeedback.blockReason})`)
  }

  const candidate = body?.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text

  if (!text) {
    // An empty candidate with MAX_TOKENS or a bare stop is a bad roll, not a
    // permanent failure — another attempt usually produces content.
    throw new RetryableError(
      candidate?.finishReason
        ? `Gemini dừng sớm (${candidate.finishReason})`
        : 'Gemini không trả về nội dung',
    )
  }

  let parsed: Partial<GeneratedTask>
  try {
    parsed = JSON.parse(extractJson(text))
  } catch {
    // Malformed JSON is the failure this user hits most; it is a sampling
    // artefact and clears on a re-roll, so it is retryable rather than fatal.
    throw new RetryableError('Gemini trả về dữ liệu không đọc được')
  }

  if (!parsed.title?.trim()) throw new RetryableError('Gemini trả về thiếu title')

  const points = Number(parsed.storyPoints)

  return {
    title: parsed.title.trim(),
    description: (parsed.description ?? '').trim(),
    dod: (parsed.dod ?? '').trim(),
    // Clamp rather than trust: the team's scale stops at 3 and a stray 5 or 8
    // would sail straight into Jira.
    storyPoints: Number.isFinite(points) ? Math.min(3, Math.max(1, Math.round(points))) : undefined,
  }
}

export interface GenerateOutcome extends GeneratedTask {
  /** Attempts used, so the UI can mention when it had to fight for a result. */
  attempts: number
}

export async function generateTask(
  idea: string,
  context: { pointRules: string; parentSummary?: string },
): Promise<GenerateOutcome> {
  const apiKey = getSetting(SETTING_KEYS.googleApiKey)
  const model = getSetting(SETTING_KEYS.geminiModel) ?? 'gemini-3.5-flash'
  if (!apiKey) throw new Error('Chưa có Google API key — vào Settings điền')

  const prompt = buildPrompt(idea, context)

  const { value, attempts } = await withRetry(() => callOnce(model, apiKey, prompt), {
    maxAttempts: MAX_ATTEMPTS,
  })

  return { ...value, attempts }
}

export function pointRulesText(): string {
  const rules = [
    ['1', getSetting(SETTING_KEYS.pointBudget1) ?? '1-2h'],
    ['2', getSetting(SETTING_KEYS.pointBudget2) ?? '4h'],
    ['3', getSetting(SETTING_KEYS.pointBudget3) ?? '1d-2d'],
  ]
  return rules.map(([p, spec]) => `- ${p} point = ${spec}`).join('\n')
}
