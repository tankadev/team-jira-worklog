'use server'

import { revalidatePath } from 'next/cache'

import { getMyself } from '@/lib/jira/client'
import { transitionIssue, updateStoryPoints } from '@/lib/jira/issues'
import { createWorklog } from '@/lib/jira/worklog'
import { SETTING_KEYS, getSetting } from '@/lib/settings'
import { DEFAULT_TZ } from '@/lib/time'

export interface ActionResult {
  ok: boolean
  message: string
}

/**
 * Logs work on one issue. The minimum step is enforced here rather than only in
 * the UI, because the value arrives from a client component and could be
 * anything. Over-budget hours are deliberately NOT blocked — story points are an
 * estimate, and the app only ever warns about them.
 */
export async function logWorkAction(input: {
  issueKey: string
  hours: number
  date: string
  comment?: string
  sequence?: number
}): Promise<ActionResult> {
  const step = Number(getSetting(SETTING_KEYS.logStepHours) ?? '0.5') || 0.5

  if (!Number.isFinite(input.hours) || input.hours <= 0) {
    return { ok: false, message: 'Số giờ không hợp lệ' }
  }
  if (input.hours < step) {
    return { ok: false, message: `Tối thiểu ${step}h mỗi lần log` }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, message: 'Ngày không hợp lệ' }
  }

  try {
    const me = await getMyself()
    await createWorklog({
      issueKey: input.issueKey,
      hours: input.hours,
      date: input.date,
      comment: input.comment,
      sequence: input.sequence ?? 0,
      tz: me.timeZone ?? DEFAULT_TZ,
    })
    revalidatePath('/')
    return { ok: true, message: `Đã log ${input.hours}h cho ${input.issueKey}` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không log được',
    }
  }
}

/**
 * Writes a story point estimate. Values outside the team's 1–3 scale are
 * rejected for subtasks but allowed on a parent, whose value is the sum of its
 * children and so routinely exceeds 3.
 */
export async function setStoryPointsAction(
  issueKey: string,
  points: number | null,
): Promise<ActionResult> {
  if (points !== null && (!Number.isFinite(points) || points < 0 || points > 999)) {
    return { ok: false, message: 'Story point không hợp lệ' }
  }

  try {
    await updateStoryPoints(issueKey, points)
    revalidatePath('/')
    return {
      ok: true,
      message: points === null ? `Đã xoá point ${issueKey}` : `${issueKey} → ${points} SP`,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không đổi được story point',
    }
  }
}

export async function transitionAction(
  issueKey: string,
  transitionId: string,
  toStatusName: string,
): Promise<ActionResult> {
  try {
    await transitionIssue(issueKey, transitionId)
    revalidatePath('/')
    return { ok: true, message: `${issueKey} → ${toStatusName}` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không đổi được trạng thái',
    }
  }
}
