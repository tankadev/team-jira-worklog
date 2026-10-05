import 'server-only'

import { extractIssueKeys } from '@/lib/jira/branch-keys'
import { SETTING_KEYS, getSetting, requireProjectKey } from '@/lib/settings'
import { DEFAULT_TZ, addDays, startOfDay } from '@/lib/time'

import type { DeployEnv, DeployPr } from './model'

interface SearchItem {
  number: number
  title: string
  body: string | null
  html_url: string
  repository_url: string
  user?: { login?: string }
  pull_request?: { merged_at?: string | null }
}

/** `2026-10-04T17:00:00Z` — the form GitHub's search date qualifiers take. */
function isoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * PRs merged into each environment's branch between two local dates,
 * inclusive.
 *
 * Read-only by construction: one search request per environment, GET only, and
 * the token is only ever sent to api.github.com. Several repos go into one
 * query — GitHub ORs repeated `repo:` qualifiers — so the cost is one request
 * per branch however many repos there are.
 *
 * Jira keys are read from the title and body, which is where this team writes
 * them; the search API does not return the head branch.
 */
export async function fetchMergedPrs(
  repos: string[],
  envs: DeployEnv[],
  from: string,
  to: string,
  tz = DEFAULT_TZ,
): Promise<DeployPr[]> {
  const token = getSetting(SETTING_KEYS.githubToken)?.trim()
  if (!token) throw new Error('Chưa có GitHub token — điền ở Settings › AI & GitHub (chỉ cần quyền đọc Pull requests).')
  const clean = repos.map((r) => r.trim()).filter((r) => /^[\w.-]+\/[\w.-]+$/.test(r))
  if (!clean.length) throw new Error('Chưa khai báo repo nào — mở tab Cấu hình của Tiến độ team, điền dạng owner/repo.')

  const projectKey = requireProjectKey()
  const range = `${isoUtc(startOfDay(from, tz))}..${isoUtc(startOfDay(addDays(to, 1), tz) - 1000)}`

  const branches = envs.filter((e) => e.branch)
  const results = await Promise.all(
    branches.map(async (env) => {
      const q = ['is:pr', 'is:merged', `base:${env.branch}`, `merged:${range}`, ...clean.map((r) => `repo:${r}`)].join(' ')
      const res = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100&sort=updated`, {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: `Bearer ${token}`,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) {
        const detail = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? ''
        if (res.status === 401) throw new Error('GitHub token không hợp lệ hoặc đã hết hạn.')
        if (res.status === 403 || res.status === 429) throw new Error(`GitHub từ chối (${res.status}) — có thể chạm giới hạn tìm kiếm, thử lại sau 1 phút. ${detail}`)
        if (res.status === 422) throw new Error(`GitHub không nhận truy vấn — kiểm tra tên repo/nhánh. ${detail}`)
        throw new Error(`GitHub trả về HTTP ${res.status}. ${detail}`)
      }
      const body = (await res.json()) as { items?: SearchItem[] }
      return (body.items ?? []).map(
        (it): DeployPr => ({
          repo: it.repository_url.split('/repos/')[1] ?? '',
          number: it.number,
          title: it.title,
          url: it.html_url,
          mergedAt: it.pull_request?.merged_at ?? '',
          author: it.user?.login ?? '',
          keys: extractIssueKeys(`${it.title}\n${(it.body ?? '').slice(0, 4000)}`, [projectKey]),
          base: env.branch,
        }),
      )
    }),
  )

  return results.flat().sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
}
