import 'server-only'

import { SETTING_KEYS, getSetting } from '../settings'

export class JiraError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body?: unknown,
  ) {
    super(message)
    this.name = 'JiraError'
  }
}

export interface JiraCreds {
  baseUrl: string
  email: string
  apiToken: string
}

export function readCreds(): JiraCreds | null {
  const baseUrl = getSetting(SETTING_KEYS.jiraBaseUrl)?.replace(/\/+$/, '')
  const email = getSetting(SETTING_KEYS.jiraEmail)
  const apiToken = getSetting(SETTING_KEYS.jiraApiToken)
  if (!baseUrl || !email || !apiToken) return null
  return { baseUrl, email, apiToken }
}

function authHeader({ email, apiToken }: JiraCreds) {
  return 'Basic ' + Buffer.from(`${email}:${apiToken}`).toString('base64')
}

/** Turns Jira's several error shapes into one readable sentence. */
function describeError(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    const messages = Array.isArray(b.errorMessages) ? (b.errorMessages as string[]) : []
    const fieldErrors = b.errors && typeof b.errors === 'object'
      ? Object.entries(b.errors as Record<string, string>).map(([k, v]) => `${k}: ${v}`)
      : []
    const all = [...messages, ...fieldErrors].filter(Boolean)
    if (all.length) return all.join(' · ')
    if (typeof b.message === 'string') return b.message
  }
  if (typeof body === 'string' && body.trim()) return body.slice(0, 300)
  if (status === 401) return 'Sai email hoặc API token'
  if (status === 403) return 'Token hợp lệ nhưng không đủ quyền'
  if (status === 404) return 'Không tìm thấy — kiểm tra lại key hoặc quyền truy cập'
  return `Jira trả về HTTP ${status}`
}

export interface JiraFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  creds?: JiraCreds
}

/**
 * Every Jira call goes through here. `cache: 'no-store'` is deliberate — this is
 * a live view over Jira and a cached read would silently show stale worklogs.
 */
export async function jiraFetch<T = unknown>(path: string, options: JiraFetchOptions = {}): Promise<T> {
  const { body, creds: given, headers, ...rest } = options
  const creds = given ?? readCreds()
  if (!creds) throw new JiraError('Chưa cấu hình Jira — vào Settings điền URL, email và API token', 0, path)

  const url = path.startsWith('http') ? path : `${creds.baseUrl}${path}`

  const res = await fetch(url, {
    ...rest,
    cache: 'no-store',
    headers: {
      Authorization: authHeader(creds),
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  // 204 is the documented success response for a transition.
  if (res.status === 204) return undefined as T

  const contentType = res.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? await res.json().catch(() => undefined)
    : await res.text()

  if (!res.ok) throw new JiraError(describeError(res.status, payload), res.status, url, payload)

  return payload as T
}

/**
 * Paginates /rest/api/3/search/jql.
 *
 * Two things here are not obvious and are both deliberate:
 *   - `fields` is always sent. This endpoint returns ids ONLY by default, unlike
 *     GET issue, so omitting it yields objects with no usable data.
 *   - The loop keys off nextPageToken, never `isLast`. `isLast` has a known bug
 *     (JRACLOUD-94648) where it stays false forever; the repeated-token guard is
 *     a second belt against spinning.
 */
export async function searchJql<T = JiraIssue>(
  jql: string,
  fields: string[],
  opts: { maxResults?: number; limit?: number; creds?: JiraCreds; expand?: string } = {},
): Promise<T[]> {
  const pageSize = opts.maxResults ?? 100
  const hardLimit = opts.limit ?? 1000
  const out: T[] = []
  const seenTokens = new Set<string>()
  let token: string | undefined

  while (out.length < hardLimit) {
    const params = new URLSearchParams({
      jql,
      maxResults: String(Math.min(pageSize, hardLimit - out.length)),
      fields: fields.join(','),
    })
    if (opts.expand) params.set('expand', opts.expand)
    if (token) params.set('nextPageToken', token)

    const page = await jiraFetch<{ issues?: T[]; nextPageToken?: string | null }>(
      `/rest/api/3/search/jql?${params}`,
      { creds: opts.creds },
    )

    out.push(...(page.issues ?? []))

    const next = page.nextPageToken
    if (!next || seenTokens.has(next)) break
    seenTokens.add(next)
    token = next
  }

  return out.slice(0, hardLimit)
}

export interface JiraIssue {
  id: string
  key: string
  fields: Record<string, unknown> & {
    summary?: string
    issuetype?: { id: string; name: string; subtask?: boolean; hierarchyLevel?: number }
    status?: { id: string; name: string; statusCategory?: { key: string } }
    parent?: { id: string; key: string; fields?: { summary?: string; issuetype?: { name: string } } }
    assignee?: { accountId: string; displayName: string } | null
    timespent?: number | null
  }
}

export interface JiraMyself {
  accountId: string
  displayName: string
  emailAddress?: string
  timeZone?: string
}

export async function getMyself(creds?: JiraCreds): Promise<JiraMyself> {
  return jiraFetch<JiraMyself>('/rest/api/3/myself', { creds })
}
