'use server'

import { getMyself } from '@/lib/jira/client'
import { transitionIssue, updateDates, updateStoryPoints } from '@/lib/jira/issues'
import { createWorklog, loggedMinutesOnDate } from '@/lib/jira/worklog'
import { SETTING_KEYS, getSetting, getWorkSchedule } from '@/lib/settings'
import { DEFAULT_TZ, formatClock, placeWorklog } from '@/lib/time'

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
    const tz = me.timeZone ?? DEFAULT_TZ

    // Where the entry lands is decided here, from what the day already holds —
    // never by the client. Entries used to be stamped 09:00 every time, so a
    // full day arrived in Jira as six overlapping blocks all starting together.
    const already = await loggedMinutesOnDate(input.date, me.accountId, tz, input.issueKey)
    const placed = placeWorklog(already, input.hours * 60, getWorkSchedule())

    await createWorklog({
      issueKey: input.issueKey,
      hours: input.hours,
      date: input.date,
      comment: input.comment,
      startMinute: placed.start,
      tz,
    })
    // No revalidatePath here: the board is fully dynamic, so there is nothing
    // cached to expire. The caller refreshes the router instead.
    return {
      ok: true,
      message:
        `Đã log ${input.hours}h cho ${input.issueKey} · ` +
        `${formatClock(placed.start)}–${formatClock(placed.end)}`,
    }
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Writes start and/or due date on an existing issue.
 *
 * Both arrive as `undefined` when untouched and `null` when cleared — the two
 * mean different things to Jira, so they must survive the trip separately. The
 * ordering rule is checked here because the popover can send one date while the
 * other stays as it is on the issue; the caller passes both for that reason.
 */
export async function setDatesAction(
  issueKey: string,
  dates: { startDate?: string | null; dueDate?: string | null },
): Promise<ActionResult> {
  for (const value of [dates.startDate, dates.dueDate]) {
    if (value != null && !ISO_DATE.test(value)) return { ok: false, message: 'Ngày không hợp lệ' }
  }
  if (dates.startDate && dates.dueDate && dates.dueDate < dates.startDate) {
    return { ok: false, message: 'Due date không được sớm hơn start date' }
  }

  try {
    await updateDates(issueKey, dates)
    return { ok: true, message: `Đã cập nhật ngày cho ${issueKey}` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không đổi được ngày',
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
    return { ok: true, message: `${issueKey} → ${toStatusName}` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không đổi được trạng thái',
    }
  }
}
