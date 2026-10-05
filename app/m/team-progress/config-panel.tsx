'use client'

import { useState, useTransition } from 'react'

import type { DeployEnv, PlatformAlias } from '@/lib/modules/team-progress/model'
import type { TeamProgressConfig } from '@/lib/modules/team-progress/store'

import { Working } from '../../spinner'
import { saveConfigAction } from './actions'

/**
 * Edited as plain lines rather than a grid of inputs: each list is short, and
 * a line per entry is quicker to read, reorder and paste than rows of fields.
 *
 *   platforms:  `Web/Desktop: web, desktop, web/desktop`
 *   envs:       `Staging | staging | STAGING`  (label | git branch | status word)
 *   repos:      `owner/repo`
 */
const platformsToText = (ps: PlatformAlias[]) => ps.map((p) => `${p.platform}: ${p.aliases.join(', ')}`).join('\n')
const envsToText = (es: DeployEnv[]) => es.map((e) => `${e.label} | ${e.branch} | ${e.statusToken}`).join('\n')

function parsePlatforms(text: string): PlatformAlias[] {
  return text
    .split('\n')
    .map((line) => {
      const [name, rest = ''] = line.split(':')
      return { platform: name.trim(), aliases: rest.split(',').map((a) => a.trim()).filter(Boolean) }
    })
    .filter((p) => p.platform)
}

function parseEnvs(text: string): DeployEnv[] {
  return text
    .split('\n')
    .map((line) => {
      const [label = '', branch = '', statusToken = ''] = line.split('|').map((s) => s.trim())
      return { label, branch, statusToken }
    })
    .filter((e) => e.label)
}

export function ConfigPanel({ initial, githubReady }: { initial: TeamProgressConfig; githubReady: boolean }) {
  const [platforms, setPlatforms] = useState(platformsToText(initial.platforms))
  const [envs, setEnvs] = useState(envsToText(initial.envs))
  const [repos, setRepos] = useState(initial.repos.join('\n'))
  const [examples, setExamples] = useState(initial.examples)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      setResult(
        await saveConfigAction({
          platforms: parsePlatforms(platforms),
          envs: parseEnvs(envs),
          repos: repos.split(/[\n,]/).map((r) => r.trim()).filter(Boolean),
          examples,
        }),
      )
    })
  }

  const field = 'w-full resize-y rounded-lg border border-line bg-ground px-3 py-2 font-mono text-small leading-[1.55]'

  return (
    <div className="flex flex-col gap-3.5">
      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-ink-2">Nền tảng và tag trong tiêu đề</span>
        <span className="text-micro text-ink-3">Mỗi dòng: tên nền tảng: các tag nghĩa là nó (không phân biệt hoa thường)</span>
        <textarea rows={5} value={platforms} onChange={(e) => setPlatforms(e.target.value)} className={field} spellCheck={false} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-ink-2">Môi trường</span>
        <span className="text-micro text-ink-3">
          Mỗi dòng: tên hiển thị | nhánh git PR merge vào | chữ trong status Jira (READY TO TEST ON …). Thấp → cao. Bỏ trống phần không có.
        </span>
        <textarea rows={4} value={envs} onChange={(e) => setEnvs(e.target.value)} className={field} spellCheck={false} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-ink-2">Repo GitHub cho phần deploy</span>
        <span className="text-micro text-ink-3">
          Mỗi dòng một repo dạng owner/repo.{' '}
          {githubReady ? 'Đã có GitHub token.' : 'Chưa có GitHub token — điền ở Settings › AI & GitHub (chỉ cần quyền đọc Pull requests).'}
        </span>
        <textarea rows={3} value={repos} onChange={(e) => setRepos(e.target.value)} className={field} spellCheck={false} placeholder="org/web-app" />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-small font-medium text-ink-2">Báo cáo mẫu cho AI học văn phong</span>
        <span className="text-micro text-ink-3">
          Dán 1–3 báo cáo cũ, ngăn cách bằng một dòng ---. AI chỉ học cách viết, không lấy số liệu. Báo cáo đã Copy cũng tự được dùng làm mẫu.
        </span>
        <textarea rows={8} value={examples} onChange={(e) => setExamples(e.target.value)} className={field} />
      </label>

      <div className="flex items-center justify-end gap-2">
        {result && <span className={'mr-auto text-small ' + (result.ok ? 'text-good' : 'text-crit')}>{result.message}</span>}
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-accent px-3 py-1.5 text-body font-semibold text-on-accent shadow-card hover:bg-accent-2 disabled:opacity-60"
        >
          {pending ? <Working>Đang lưu…</Working> : 'Lưu cấu hình'}
        </button>
      </div>
    </div>
  )
}
