import 'server-only'

import { SETTING_KEYS, getSetting } from '../settings'
import { type CommitType, COMMIT_TYPES, cleanCommitSubject, isCommitType } from '../commit-message'
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

/**
 * One call, returning the parsed JSON object. Throws RetryableError for
 * anything worth another go. Shared by every prompt; each validates the shape
 * it asked for itself.
 */
async function requestJson(
  model: string,
  apiKey: string,
  prompt: string,
  temperature = 0.4,
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
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

  try {
    const parsed = JSON.parse(extractJson(text))
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    // fall through
  }
  // Malformed JSON is the failure this user hits most; it is a sampling
  // artefact and clears on a re-roll, so it is retryable rather than fatal.
  throw new RetryableError('Gemini trả về dữ liệu không đọc được')
}

/** The task prompt's answer, validated. */
function parseTask(raw: Record<string, unknown>): GeneratedTask {
  const parsed = raw as Partial<GeneratedTask>
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
  /** Which model actually answered — may be a fallback. */
  model: string
}

/**
 * Runs a prompt, falling through to a spare model when the primary is out of
 * quota.
 *
 * Retrying alone cannot help there: a spent quota stays spent for the rest of
 * the window, so the only way through is a different model. Transient failures
 * are still handled by the retry inside each attempt — including an answer
 * that `parse` rejects, which throws RetryableError for a re-roll.
 *
 * Exported so a module's own prompts share the same key, models and fallback.
 */
export async function runPrompt<T>(
  prompt: string,
  parse: (raw: Record<string, unknown>) => T,
  temperature?: number,
): Promise<T & { attempts: number; model: string }> {
  const apiKey = getSetting(SETTING_KEYS.googleApiKey)
  if (!apiKey) throw new Error('Chưa có Google API key — vào Settings điền')

  const primary = getSetting(SETTING_KEYS.geminiModel)?.trim() || 'gemini-3.1-flash-lite'
  const fallbacks = (getSetting(SETTING_KEYS.geminiFallbackModels) ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m && m !== primary)

  let totalAttempts = 0
  let last: Error | null = null

  for (const model of [primary, ...fallbacks]) {
    try {
      const { value, attempts } = await withRetry(
        async () => parse(await requestJson(model, apiKey, prompt, temperature)),
        { maxAttempts: MAX_ATTEMPTS },
      )
      return { ...value, attempts: totalAttempts + attempts, model }
    } catch (error) {
      totalAttempts += MAX_ATTEMPTS
      last = error instanceof Error ? error : new Error(String(error))
      // A bad key or a blocked prompt will fail on every model, so stop.
      if (!/quota|429|503|overload|high demand|không đọc được|dừng sớm/i.test(last.message)) throw last
    }
  }

  throw last ?? new Error('Gemini lỗi')
}

export async function generateTask(
  idea: string,
  context: { pointRules: string; parentSummary?: string },
): Promise<GenerateOutcome> {
  return runPrompt(buildPrompt(idea, context), parseTask)
}

/**
 * A Conventional Commits subject for a Jira issue: the type and a short
 * imperative line. The app adds `Ref: VT-123` itself, and lets the user switch
 * the type without asking again — so the model only decides what it is good at.
 */
export async function generateCommitMessage(input: {
  issueKey: string
  summary: string
  description: string
  issueTypeName: string
  parentSummary: string | null
  parentTypeName: string | null
}): Promise<{ type: CommitType; subject: string; attempts: number; model: string }> {
  return runPrompt(buildCommitPrompt(input), parseCommit, 0.3)
}

function buildCommitPrompt(input: {
  issueKey: string
  summary: string
  description: string
  issueTypeName: string
  parentSummary: string | null
  parentTypeName: string | null
}) {
  return `You write git commit messages following the Conventional Commits spec.

Pick exactly one type:
${COMMIT_TYPES.map((t) => `- ${t.type}: ${t.hint}`).join('\n')}

Rules for the subject:
- English, imperative mood ("add", "fix", "handle" — not "added" or "adds")
- lowercase first letter, no trailing period
- at most 60 characters, specific about what changes
- no Jira key, no ticket tags like [CTALK] or [Web], no type prefix — only the words
- a Bug (or a task under a Bug) is almost always "fix"

Jira issue ${input.issueKey} (${input.issueTypeName}):
Title: ${input.summary}
${input.description ? `Description:\n"""\n${input.description.slice(0, 3000)}\n"""\n` : ''}${
    input.parentSummary
      ? `It is a subtask of ${input.parentTypeName ?? 'a task'}: "${input.parentSummary}"\n`
      : ''
  }
Return ONLY a JSON object, no explanation, no markdown fence:
{"type": "fix", "subject": "..."}`
}

/** The commit prompt's answer, validated and cleaned to the rules above. */
function parseCommit(raw: Record<string, unknown>): { type: CommitType; subject: string } {
  const type = String(raw.type ?? '').trim().toLowerCase()
  const subject = cleanCommitSubject(String(raw.subject ?? ''))
  if (!subject) throw new RetryableError('Gemini trả về thiếu subject')
  return { type: isCommitType(type) ? type : 'chore', subject }
}

export function pointRulesText(): string {
  const rules = [
    ['1', getSetting(SETTING_KEYS.pointBudget1) ?? '1-2h'],
    ['2', getSetting(SETTING_KEYS.pointBudget2) ?? '4h'],
    ['3', getSetting(SETTING_KEYS.pointBudget3) ?? '1d-2d'],
  ]
  return rules.map(([p, spec]) => `- ${p} point = ${spec}`).join('\n')
}
