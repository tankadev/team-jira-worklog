'use server'

import { revalidatePath } from 'next/cache'

import { SETTING_KEYS, getSetting } from '@/lib/settings'
import { isModuleEnabled } from '@/lib/modules/state'
import { type MapCandidate, mapDailies, polishReport } from '@/lib/modules/team-progress/ai'
import { fetchMergedPrs } from '@/lib/modules/team-progress/github'
import type { DailyMatch, DeployPr, Selection } from '@/lib/modules/team-progress/model'
import {
  type ProgressTemplate,
  type ReportDraft,
  type TeamProgressConfig,
  addHistory,
  getConfig,
  getHistory,
  saveConfig,
  saveDailies,
  saveDailyMap,
  saveDraft,
  saveSelection,
  saveTemplates,
  setLastPlatform,
} from '@/lib/modules/team-progress/store'
import { templateProblem } from '@/lib/modules/team-progress/template'

export interface Result<T = undefined> {
  ok: boolean
  message: string
  data?: T
}

const OFF: Result<never> = { ok: false, message: 'Module đang tắt' }
const enabled = () => isModuleEnabled('team-progress')
const fail = (error: unknown, fallback: string): Result<never> => ({
  ok: false,
  message: error instanceof Error ? error.message : fallback,
})

export async function saveSelectionAction(platform: string, selection: Selection): Promise<Result> {
  if (!enabled()) return OFF
  saveSelection(platform, selection)
  return { ok: true, message: '' }
}

export async function setPlatformAction(platform: string): Promise<Result> {
  if (!enabled()) return OFF
  setLastPlatform(platform)
  return { ok: true, message: '' }
}

export async function saveDraftAction(platform: string, draft: ReportDraft): Promise<Result> {
  if (!enabled()) return OFF
  saveDraft(platform, draft)
  return { ok: true, message: '' }
}

export async function saveDailiesAction(platform: string, date: string, text: string): Promise<Result> {
  if (!enabled()) return OFF
  saveDailies(platform, { date, text })
  return { ok: true, message: '' }
}

export async function aiMapDailiesAction(input: {
  platform: string
  date: string
  dailies: string
  candidates: MapCandidate[]
}): Promise<Result<DailyMatch[]>> {
  if (!enabled()) return OFF
  if (!getSetting(SETTING_KEYS.googleApiKey)) return { ok: false, message: 'Chưa có Google API key — điền ở Settings › AI & GitHub' }
  if (!input.dailies.trim()) return { ok: false, message: 'Chưa dán daily nào' }
  try {
    const matches = await mapDailies(input.dailies, input.candidates)
    saveDailyMap(input.platform, { date: input.date, source: input.dailies, matches })
    const hit = matches.filter((m) => m.key).length
    return { ok: true, message: `Đã map ${hit}/${matches.length} dòng daily với task trên Jira`, data: matches }
  } catch (error) {
    return fail(error, 'AI lỗi')
  }
}

/** Called on Copy: the report as sent, kept for the AI's next comparison. */
export async function recordSentAction(platform: string, date: string, text: string): Promise<Result> {
  if (!enabled()) return OFF
  if (text.trim()) addHistory(platform, { date, text })
  return { ok: true, message: 'Đã copy' }
}

export async function saveTemplatesAction(list: ProgressTemplate[]): Promise<Result> {
  if (!enabled()) return OFF
  for (const t of list) {
    if (!t.name.trim()) return { ok: false, message: 'Template cần có tên' }
    const problem = templateProblem(t.body)
    if (problem) return { ok: false, message: `Template "${t.name}": ${problem}` }
  }
  if (!list.length) return { ok: false, message: 'Phải còn ít nhất một template' }
  const def = list.find((t) => t.isDefault) ?? list[0]
  saveTemplates(list.map((t) => ({ ...t, name: t.name.trim(), isDefault: t.id === def.id })))
  revalidatePath('/m/team-progress')
  return { ok: true, message: 'Đã lưu template' }
}

export async function saveConfigAction(config: TeamProgressConfig): Promise<Result> {
  if (!enabled()) return OFF
  if (!config.platforms.length) return { ok: false, message: 'Cần ít nhất một nền tảng' }
  const badRepo = config.repos.find((r) => !/^[\w.-]+\/[\w.-]+$/.test(r))
  if (badRepo) return { ok: false, message: `Repo "${badRepo}" phải có dạng owner/repo` }
  saveConfig(config)
  revalidatePath('/m/team-progress')
  return { ok: true, message: 'Đã lưu cấu hình' }
}

export async function fetchPrsAction(from: string, to: string): Promise<Result<DeployPr[]>> {
  if (!enabled()) return OFF
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
    return { ok: false, message: 'Khoảng ngày không hợp lệ' }
  }
  try {
    const { repos, envs } = getConfig()
    const prs = await fetchMergedPrs(repos, envs, from, to)
    return { ok: true, message: prs.length ? `${prs.length} PR đã merge` : 'Không có PR nào merge trong khoảng này', data: prs }
  } catch (error) {
    return fail(error, 'Không lấy được PR từ GitHub')
  }
}

export async function aiPolishAction(input: {
  platform: string
  date: string
  draft: string
  prTitles: Array<{ env: string; title: string }>
  /** The team's daily reports, pasted as-is. */
  dailies: string
  /** Lines already matched to issues, one per line, for the prompt. */
  dailyMap?: string[]
}): Promise<Result<{ text: string; insights: string[]; model: string }>> {
  if (!enabled()) return OFF
  if (!getSetting(SETTING_KEYS.googleApiKey)) return { ok: false, message: 'Chưa có Google API key — điền ở Settings › AI & GitHub' }
  if (!input.draft.trim()) return { ok: false, message: 'Chưa có nội dung để viết lại' }
  try {
    const { examples } = getConfig()
    // The user's own pasted samples first, then the latest reports they sent
    // on other days — the closest thing to their current voice.
    const past = getHistory(input.platform)
      .filter((r) => r.date !== input.date)
      .slice(0, 2)
      .map((r) => r.text)
    const samples = [...examples.split(/\n-{3,}\n/), ...past]
    const out = await polishReport({
      platform: input.platform,
      draft: input.draft,
      examples: samples,
      prTitles: input.prTitles,
      dailies: input.dailies,
      dailyMap: input.dailyMap,
    })
    return {
      ok: true,
      message: `AI đã viết lại (${out.model})${input.dailies.trim() ? ' — có dùng daily của team' : ''}`,
      data: out,
    }
  } catch (error) {
    return fail(error, 'AI lỗi')
  }
}
