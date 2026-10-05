'use server'

import { getMyself } from '@/lib/jira/client'
import { generateCommitMessage, generateTask, pointRulesText } from '@/lib/ai/gemini'
import { adfToText } from '@/lib/jira/adf'
import type { CommitType } from '@/lib/commit-message'
import {
  attachToSprint,
  getIssueDetail,
  transitionIssue,
  updateDates,
  updateStoryPoints,
  updateDescription,
  updateSummary,
} from '@/lib/jira/issues'
import {
  createWorklog,
  deleteWorklog,
  getWorklog,
  loggedMinutesOnDate,
  updateWorklog,
} from '@/lib/jira/worklog'
import { dayStatusText } from '@/lib/calendar-grid'
import { quotaRules } from '@/lib/worklog-calendar'
import { quotaForDate } from '@/lib/quota'
import { listDaysOff } from '@/lib/days-off'
import { scheduleForDate } from '@/lib/quota'
import { SETTING_KEYS, getSetting, getWorkSchedule } from '@/lib/settings'
import {
  type WorklogSlice,
  DEFAULT_TZ,
  formatDuration,
  formatSlices,
  jiraStarted,
  sliceWorklog,
} from '@/lib/time'

export interface ActionResult {
  ok: boolean
  message: string
  /**
   * Something reached Jira despite `ok` being false — a write made of several
   * calls that failed partway. The caller must refresh anyway, or the screen
   * keeps showing a total that is already stale.
   */
  partial?: boolean
}

export interface LogResult extends ActionResult {
  /** Ids of the worklogs written, so the board can offer an undo. */
  worklogIds?: string[]
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
}): Promise<LogResult> {
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
    // Usually one piece. Work spanning the break becomes two, because a single
    // Jira worklog runs solid through lunch — see `sliceWorklog`.
    // Half a day of leave moves where the other half sits on the clock: an
    // afternoon worked after a morning off starts at 13:00, not 09:00. Read
    // here rather than taken from the client — the same rule as `already`
    // above, and for the same reason.
    const schedule = scheduleForDate(
      input.date,
      getWorkSchedule(),
      listDaysOff(input.date, input.date),
    )
    const slices = sliceWorklog(already, input.hours * 60, schedule)

    // Sequential, and tracking what landed: this is one POST per piece, so a
    // failure on the second leaves the first already recorded in Jira. Calling
    // that a plain failure would invite a retry that logs the first piece twice.
    const done: WorklogSlice[] = []
    const ids: string[] = []
    try {
      for (const slice of slices) {
        const created = await createWorklog({
          issueKey: input.issueKey,
          hours: slice.minutes / 60,
          date: input.date,
          comment: input.comment,
          startMinute: slice.start,
          tz,
        })
        done.push(slice)
        if (created?.id) ids.push(String(created.id))
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Không log được'
      if (!done.length) return { ok: false, message: reason }

      // Both figures, named separately. "Log thất bại" would be a lie — part of
      // it is in Jira — and "đã log 1h" alone leaves the user to work out what
      // is still missing. The retry amount is spelled out because the obvious
      // move, logging the original figure again, is the one that double-counts.
      const failed = slices.slice(done.length)
      const landed = done.reduce((n, s) => n + s.minutes, 0) * 60
      const lost = failed.reduce((n, s) => n + s.minutes, 0) * 60

      return {
        ok: false,
        partial: true,
        worklogIds: ids,
        message:
          `${formatDuration(landed)} (${formatSlices(done)}) đã được log, ` +
          `nhưng xảy ra lỗi khi log ${formatDuration(lost)} (${formatSlices(failed)}): ${reason} ` +
          `— log lại ${formatDuration(lost)} thôi, đừng log lại ${input.hours}h.`,
      }
    }

    // No revalidatePath here: the board is fully dynamic, so there is nothing
    // cached to expire. The caller refreshes the router instead.
    return {
      ok: true,
      message: `Đã log ${input.hours}h cho ${input.issueKey} · ${formatSlices(slices)}`,
      worklogIds: ids,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không log được',
    }
  }
}

/**
 * Takes back worklogs the board just wrote — the undo offered for a few seconds
 * after a one-click log. Only ids handed out by `logWorkAction` reach here, so
 * it never deletes a worklog the user did not just create from this screen.
 */
export async function undoWorklogAction(input: {
  issueKey: string
  worklogIds: string[]
}): Promise<ActionResult> {
  const ids = input.worklogIds.filter((id) => /^\d+$/.test(id))
  if (!ids.length) return { ok: false, message: 'Không có worklog để hoàn tác' }

  let removed = 0
  try {
    for (const id of ids) {
      await deleteWorklog(input.issueKey, id)
      removed++
    }
    return { ok: true, message: `Đã hoàn tác lần log ${input.issueKey}` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Không hoàn tác được'
    return {
      ok: false,
      partial: removed > 0,
      message: removed > 0 ? `Mới xoá được ${removed}/${ids.length} worklog: ${reason}` : reason,
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

/**
 * Moves a parent task into the sprint and onto the team's board, from the
 * board's "ngoài sprint" block.
 *
 * The children show here regardless, but leaving the parent sprintless and
 * unlabelled keeps it missing from Jira's own board and from the sprint report —
 * so the fix is offered where the problem is visible.
 */
export async function setSprintAction(
  issueKey: string,
  sprintId: number,
): Promise<ActionResult & { id?: string }> {
  if (!Number.isInteger(sprintId) || sprintId <= 0) {
    return { ok: false, message: 'Sprint không hợp lệ' }
  }

  try {
    const { labelAdded, issueId } = await attachToSprint(issueKey, sprintId)
    return {
      ok: true,
      id: issueId,
      message: labelAdded
        ? `Đã đưa ${issueKey} vào sprint và gắn label ${labelAdded}`
        : `Đã đưa ${issueKey} vào sprint`,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không gán được sprint',
    }
  }
}

/**
 * Ghi lại mô tả issue — chỉ chạy khi người dùng bấm Lưu.
 */
export async function updateDescriptionAction(
  issueKey: string,
  description: string,
  dod: string,
): Promise<ActionResult> {
  try {
    await updateDescription(issueKey, description, dod)
    return { ok: true, message: `Đã lưu mô tả ${issueKey}` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không lưu được mô tả',
    }
  }
}

/**
 * Nhờ Gemini viết lại mô tả cho một tiêu đề đã đổi.
 *
 * Không ghi gì cả — chỉ trả chữ về để người dùng đọc, sửa, rồi mới bấm Lưu.
 * Đổi tiêu đề xong mà mô tả tự nhảy theo là thứ không ai muốn; đề xuất thì có.
 *
 * Dùng chính `generateTask` của màn Task mới, nên văn phong và luật point giống
 * hệt, và tiêu đề đóng vai "ý tưởng" — đó đúng là thứ vừa thay đổi.
 */
export async function regenerateDescriptionAction(
  title: string,
  parentSummary?: string,
): Promise<ActionResult & { description?: string; dod?: string }> {
  if (!title.trim()) return { ok: false, message: 'Chưa có tiêu đề để dựa vào' }
  try {
    const data = await generateTask(title, {
      pointRules: pointRulesText(),
      parentSummary,
    })
    return {
      ok: true,
      message: `Đã sinh lại mô tả · ${data.model}`,
      description: data.description,
      dod: data.dod,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Gemini lỗi' }
  }
}

/**
 * Đổi tiêu đề issue — chỉ chạy khi người dùng bấm Lưu trên modal chi tiết.
 *
 * Không có đường nào gọi tự động vào đây, cùng luật với `transitionAction`:
 * app không bao giờ tự ghi vào Jira thay người dùng.
 */
export async function updateSummaryAction(
  issueKey: string,
  summary: string,
): Promise<ActionResult> {
  try {
    await updateSummary(issueKey, summary)
    return { ok: true, message: `Đã đổi tiêu đề ${issueKey}` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không đổi được tiêu đề',
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


/**
 * Drafts a Conventional Commits subject for an issue from its title and
 * description — the "Commit message" button on a subtask. Read-only: it reads
 * the issue (and its parent, whose type is the best hint for fix vs feat) and
 * asks Gemini; nothing is written to Jira.
 */
export async function commitMessageAction(
  issueKey: string,
): Promise<ActionResult & { type?: CommitType; subject?: string }> {
  try {
    const issue = await getIssueDetail(issueKey)
    const parent = issue.parentKey ? await getIssueDetail(issue.parentKey).catch(() => null) : null
    const res = await generateCommitMessage({
      issueKey,
      summary: issue.summary,
      description: adfToText(issue.description),
      issueTypeName: issue.issueTypeName,
      parentSummary: parent?.summary ?? issue.parentSummary,
      parentTypeName: parent?.issueTypeName ?? null,
    })
    return { ok: true, message: `Đã sinh · ${res.model}`, type: res.type, subject: res.subject }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Gemini lỗi' }
  }
}

export interface WorklogEditResult extends ActionResult {
  /** The day that changed and how it now stands, e.g. "còn thiếu 2h". */
  day?: { date: string; text: string; full: boolean }
}

/** How `date` stands once its total is `minutes`, for the message after an edit. */
function dayAfter(date: string, minutes: number) {
  const quota = quotaForDate(date, quotaRules(date, date))
  const seconds = minutes * 60
  return {
    date,
    text: dayStatusText(seconds, quota),
    full: quota > 0 && seconds >= quota * 3600 - 60,
  }
}

/**
 * Reads a worklog and refuses one this user did not write — the calendar only
 * ever offers the user's own, but the id arrives from the client.
 */
async function ownWorklog(issueKey: string, worklogId: string) {
  if (!/^\d+$/.test(worklogId)) throw new Error('Worklog không hợp lệ')
  const [me, worklog] = await Promise.all([getMyself(), getWorklog(issueKey, worklogId)])
  if (worklog.author?.accountId !== me.accountId) throw new Error('Chỉ sửa được worklog của chính bạn')
  return { me, worklog, tz: me.timeZone ?? DEFAULT_TZ }
}

/**
 * Moves a worklog to another day — the calendar's drag and drop.
 *
 * The length stays; the start is placed the way a new log would be, after
 * whatever the target day already holds and around the break. An entry that
 * now crosses the break becomes two records, the same cut `logWorkAction`
 * makes: the original keeps the first piece, a new worklog takes the rest.
 */
export async function moveWorklogAction(input: {
  issueKey: string
  worklogId: string
  toDate: string
}): Promise<WorklogEditResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.toDate)) return { ok: false, message: 'Ngày không hợp lệ' }
  try {
    const { me, worklog, tz } = await ownWorklog(input.issueKey, input.worklogId)
    const minutes = Math.round(worklog.timeSpentSeconds / 60)
    const already = await loggedMinutesOnDate(input.toDate, me.accountId, tz, input.issueKey)
    const schedule = scheduleForDate(input.toDate, getWorkSchedule(), listDaysOff(input.toDate, input.toDate))
    const [first, ...rest] = sliceWorklog(already, minutes, schedule)

    await updateWorklog(input.issueKey, input.worklogId, {
      started: jiraStarted(input.toDate, tz, first.start),
      timeSpentSeconds: first.minutes * 60,
    })
    for (const piece of rest) {
      await createWorklog({
        issueKey: input.issueKey,
        hours: piece.minutes / 60,
        date: input.toDate,
        startMinute: piece.start,
        tz,
      })
    }

    const label = `${input.toDate.slice(8)}/${input.toDate.slice(5, 7)}`
    return {
      ok: true,
      message: `Đã chuyển ${formatDuration(minutes * 60)} sang ${label} · ${formatSlices([first, ...rest])}`,
      day: dayAfter(input.toDate, already + minutes),
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không chuyển được worklog' }
  }
}

/** Changes how long a worklog ran; its day and start stay where they are. */
export async function updateWorklogHoursAction(input: {
  issueKey: string
  worklogId: string
  hours: number
}): Promise<WorklogEditResult> {
  const step = Number(getSetting(SETTING_KEYS.logStepHours) ?? '0.5') || 0.5
  if (!Number.isFinite(input.hours) || input.hours < step) {
    return { ok: false, message: `Tối thiểu ${step}h` }
  }
  try {
    const { me, worklog, tz } = await ownWorklog(input.issueKey, input.worklogId)
    await updateWorklog(input.issueKey, input.worklogId, {
      timeSpentSeconds: Math.round(input.hours * 3600),
    })
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(worklog.started.replace(/([+-]\d{2})(\d{2})$/, '$1:$2')))
    const total = await loggedMinutesOnDate(date, me.accountId, tz, input.issueKey)
    return {
      ok: true,
      message: `Đã sửa thành ${input.hours}h`,
      day: dayAfter(date, total),
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không sửa được worklog' }
  }
}
