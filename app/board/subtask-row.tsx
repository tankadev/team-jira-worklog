"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { logWorkAction, undoWorklogAction } from "@/app/actions";
// Import from types.ts, never issues.ts — the latter pulls in the DB layer and
// would end up in the browser bundle.
import type { BoardSubtask } from "@/lib/jira/types";
import {
  issueHygiene,
  logDatePastDue,
  loggedButTodo,
  statusTone,
} from "@/lib/jira/types";
import type { DayOffKind } from "@/lib/quota";
import { DEFAULT_SCHEDULE, type WorkSchedule, formatDuration } from "@/lib/time";

import { Icon } from "../icons";
import { Spinner } from "../spinner";
import { CommitMessageButton } from "./commit-message";
import { DatesEditor } from "./dates-editor";
import { HygieneBadge } from "./hygiene-badge";
import { IssueDetail } from "./issue-detail";
import { LogStrip } from "./log-strip";
import { useNav } from "./navigation";
import { TaskLogsTrigger, WorklogCalendarDialog } from "./worklog-calendar";
import { PointsEditor } from "./points-editor";
import { StatusPill } from "./status-pill";
import { TypeIcon } from "./type-icon";

/**
 * One subtask: what it is on the left, a single `+ Log` on the right.
 *
 * Logging used to be a stepper, a clock, a note button and a Log button on
 * every row — twenty identical controls on a five-task board, for something
 * done to two or three tasks a day. Now the row carries one button; pressing
 * it opens a strip under the row where one click on an amount logs it, with a
 * few seconds to take it back.
 */
export function SubtaskRow({
  subtask,
  date,
  dateLabel,
  isToday,
  step,
  presets,
  budgets,
  sprintEnd = null,
  team = { label: null, prefix: null },
  datesSupported = true,
  dayLoggedMinutes = 0,
  dayQuotaHours = 0,
  schedule = DEFAULT_SCHEDULE,
  dayOff = null,
  railEnd = false,
}: {
  subtask: BoardSubtask;
  date: string;
  dateLabel: string;
  isToday: boolean;
  step: number;
  presets: number[];
  budgets: Record<number, string>;
  /** End of the sprint on screen, offered as a one-click due date. */
  sprintEnd?: string | null;
  /** The team's filing rules, for the warning badge. */
  team?: { label: string | null; prefix: string | null };
  /** False on a project with neither date field — hides the chip entirely. */
  datesSupported?: boolean;
  /** Logged across the whole day, which is what decides where this entry lands. */
  dayLoggedMinutes?: number;
  /** The day's quota, for the "fill the day" amount. 0 on a day off or weekend. */
  dayQuotaHours?: number;
  schedule?: WorkSchedule;
  /**
   * Leave marked on the day being logged into. Not used to place the entry —
   * `schedule` already carries that — only to say why the clock reads the way
   * it does, since a start of 13:00 with no explanation looks like a bug.
   */
  dayOff?: DayOffKind | null;
  /** Last item under its parent: the tree line stops at this row's branch. */
  railEnd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  /** The last log made here, while it can still be taken back. */
  const [undo, setUndo] = useState<{ ids: string[]; hours: number } | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [undoing, startUndo] = useTransition();
  const { refresh } = useNav();
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  function submit(hours: number, comment: string) {
    setResult(null);
    startTransition(async () => {
      const res = await logWorkAction({
        issueKey: subtask.key,
        hours,
        date,
        comment,
      });
      setResult(res);
      if (res.ok) {
        setOpen(false);
        if (res.worklogIds?.length) {
          setUndo({ ids: res.worklogIds, hours });
          if (undoTimer.current) clearTimeout(undoTimer.current);
          // Long enough to notice a wrong click, short enough that the offer
          // is gone before it could take back something deliberate.
          undoTimer.current = setTimeout(() => setUndo(null), 10_000);
        }
      }
      // `partial` means part of the entry did reach Jira — the totals on screen
      // are already wrong, so refresh even though the action reports a failure.
      if (res.ok || res.partial) refresh();
    });
  }

  function takeBack() {
    if (!undo) return;
    const ids = undo.ids;
    startUndo(async () => {
      const res = await undoWorklogAction({ issueKey: subtask.key, worklogIds: ids });
      setUndo(null);
      setResult(res);
      if (res.ok || res.partial) refresh();
    });
  }

  const today = subtask.loggedTodaySeconds;
  const total = subtask.timeSpentSeconds;
  const hygiene = issueHygiene(subtask, team);
  /**
   * The day on screen is after the due date of a task already marked Done.
   *
   * Checked against `date` — the day being logged to — not against today, so
   * it is right whichever day the board is showing.
   */
  const pastDue = logDatePastDue(subtask.dueDate, date, subtask.statusName);
  /**
   * Time really was logged after this finished task's due date — whichever day
   * the board is showing.
   *
   * Two wrong versions came before this one. Colouring on `pastDue` alone made
   * the sprint calendar a warning generator: pick any past day and half the
   * board lit up about nothing that had happened. Colouring only when the
   * *selected* day carried the time then hid it again — the mistake was on
   * 09/09 and you had to already be standing on 09/09 to find out.
   *
   * The fact is about the task, so it is read off the task: the latest day it
   * was logged to, which the board already fetches for the whole sprint.
   */
  const badLogDate = logDatePastDue(
    subtask.dueDate,
    subtask.lastLogDate ?? "",
    subtask.statusName,
  )
    ? subtask.lastLogDate
    : null;

  /**
   * A finished subtask folds to one line — key, summary, status — so a sprint
   * full of Done work stays readable while still being there (hiding it made
   * hours look missing). "Mở rộng" opens the full row for a late fix. Never folded
   * while it carries the after-due warning: that one is a problem to act on.
   */
  const folded =
    statusTone(subtask.statusName) === "done" &&
    !expanded &&
    !badLogDate &&
    !open &&
    !calendarOpen;

  if (folded) {
    return (
      <div className="relative border-b border-line transition-colors last:border-b-0 hover:bg-surface-2/60">
        <span
          aria-hidden
          className={
            "pointer-events-none absolute left-6 top-0 w-px bg-line-strong " +
            (railEnd ? "h-[19px]" : "h-full")
          }
        />
        <span aria-hidden className="pointer-events-none absolute left-6 top-[19px] h-px w-3 bg-line-strong" />
        <div className="flex items-center gap-2 py-2 pl-[44px] pr-4">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            title={`Xem chi tiết ${subtask.key}`}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-0.5 opacity-80 hover:bg-accent-soft hover:opacity-100"
          >
            <TypeIcon name="Subtask" className="size-3.5" />
            <span className="font-mono text-small font-semibold text-accent-ink">{subtask.key}</span>
          </button>
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            title={subtask.summary}
            className="min-w-0 flex-1 truncate text-left text-small text-ink-2 hover:text-accent-ink"
          >
            {subtask.summary}
          </button>
          <StatusPill issueKey={subtask.key} statusName={subtask.statusName} issueType="Sub-task" compact />
          <button
            type="button"
            onClick={() => setExpanded(true)}
            title="Mở rộng — xem giờ, ngày, point và log"
            aria-label={`Mở rộng ${subtask.key}`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-line-strong bg-surface px-2 text-caption font-medium text-ink-2 shadow-card hover:border-accent hover:text-accent-ink"
          >
            <Icon name="chevrons-down" className="size-3.5" />
            <span className="hidden sm:inline">Mở rộng</span>
          </button>
        </div>
        {detailOpen && <IssueDetail issueKey={subtask.key} onClose={() => setDetailOpen(false)} />}
      </div>
    );
  }

  return (
    <div
      title={
        badLogDate
          ? `${subtask.key} đã Done, làm xong ${subtask.startDate} → ${subtask.dueDate}.\n` +
            `Nhưng có giờ log vào ${badLogDate}, nằm sau due date.\n\n` +
            `Một trong hai đang sai: due date chưa được dời, hoặc trạng thái đóng sớm.`
          : undefined
      }
      className={
        "relative border-b border-line transition-colors last:border-b-0 " +
        // The whole row, not only the date chip. The chip is a small control
        // among eight on a crowded line, and the thing being said is about the
        // row as a whole: this task is finished, and the day you are on is not
        // one of its days. A wash plus a rule down the left reads at a glance
        // scanning the list, which is how a row this wide is actually read.
        (badLogDate
          ? "border-l-2 border-l-warn bg-warn-soft/40 hover:bg-warn-soft/60"
          : "hover:bg-surface-2/60")
      }
    >
      {/* Two tiers instead of one crowded line. The summary — what a task is
          actually picked by — gets the full width on top, its facts sit in a
          quiet line under it, and the controls touched on every log stay in one
          cluster on the right (wrapping under the text on a phone). */}
      {/* Tree line back to the parent: a rail down the left and a branch into
          each row, so a subtask reads as belonging to the card it hangs off. */}
      <span
        aria-hidden
        className={
          "pointer-events-none absolute left-6 top-0 w-px bg-line-strong " +
          (railEnd ? "h-[22px]" : "h-full")
        }
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-6 top-[22px] h-px w-3 bg-line-strong"
      />
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 py-3 pl-[44px] pr-4">
        <div className="min-w-0 flex-1 basis-[300px]">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              title={`Xem chi tiết ${subtask.key}`}
              className="mt-px flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-0.5 hover:bg-accent-soft"
            >
              <TypeIcon name="Subtask" className="size-3.5" />
              <span className="font-mono text-small font-semibold text-accent-ink underline-offset-2 hover:underline">
                {subtask.key}
              </span>
            </button>

            {/* Two lines, then ellipsis. Anything longer is still in the tooltip
                and in the detail panel. */}
            <button
              type="button"
              onClick={() => setDetailOpen(true)}
              title={subtask.summary}
              className="line-clamp-2 min-w-0 text-left text-body font-medium leading-[1.4] text-ink hover:text-accent-ink"
            >
              {subtask.summary}
            </button>
            {(hygiene.missingLabel || hygiene.missingPrefix) && (
              <span className="shrink-0 pt-px">
                <HygieneBadge hygiene={hygiene} />
              </span>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusPill
              issueKey={subtask.key}
              statusName={subtask.statusName}
              // Every row here is a subtask, so they all share one cache entry per status.
              issueType="Sub-task"
              compact
            />

            {datesSupported && (
              <DatesEditor
                issueKey={subtask.key}
                startDate={subtask.startDate}
                dueDate={subtask.dueDate}
                sprintEnd={sprintEnd}
                isDone={statusTone(subtask.statusName) === "done"}
                loggingPastDue={badLogDate}
              />
            )}

            <PointsEditor
              issueKey={subtask.key}
              value={subtask.storyPoints}
              budgets={budgets}
              spentSeconds={total}
            />

            {/* Hover for the days this task was logged on; click for the
                calendar to move, resize or add worklogs. */}
            <TaskLogsTrigger
              issueKey={subtask.key}
              summary={subtask.summary}
              anchorDate={subtask.lastLogDate ?? date}
              presets={presets}
              step={step}
            >
            <span className="text-caption text-ink-3">
              {today > 0 || total > 0 ? (
                <>
                  {isToday ? "Hôm nay" : `Ngày ${date.slice(8, 10)}/${date.slice(5, 7)}`}{" "}
                  <b
                    className={
                      "font-mono font-semibold " +
                      (today > 0 ? "text-accent-ink" : "text-ink-3")
                    }
                  >
                    {today > 0 ? formatDuration(today) : "0h"}
                  </b>
                  <span className="mx-1 opacity-50">·</span>
                  Tổng{" "}
                  <b className="font-mono font-semibold text-ink-2">
                    {formatDuration(total)}
                  </b>
                </>
              ) : (
                "Chưa log giờ"
              )}
            </span>
            </TaskLogsTrigger>

            {badLogDate && (
              <span
                title={
                  `${subtask.key} đã Done với due date ${subtask.dueDate}, ` +
                  `nhưng ngày ${badLogDate} vẫn có giờ được log.\n\n` +
                  `Một trong hai đang sai: due date chưa được dời, hoặc trạng thái đóng sớm.`
                }
                className="rounded-[5px] border border-warn bg-warn-soft px-1.5 py-px chip-text text-warn"
              >
                ⚠ log {badLogDate.slice(8)}/{badLogDate.slice(5, 7)} · sau due
              </span>
            )}
            {loggedButTodo(total, subtask.statusName) && (
              <span
                title={`${subtask.key} đã log ${formatDuration(total)} nhưng vẫn đang To Do — nhớ chuyển trạng thái`}
                className="rounded-[5px] border border-warn bg-warn-soft px-1.5 py-px chip-text text-warn"
              >
                ⚠ vẫn To Do
              </span>
            )}
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {expanded && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title="Thu gọn task đã Done"
              aria-label={`Thu gọn ${subtask.key}`}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-surface px-2.5 text-caption font-medium text-ink-2 shadow-card hover:border-accent hover:text-accent-ink"
            >
              <Icon name="chevrons-up" className="size-3.5" />
              <span className="hidden sm:inline">Thu gọn</span>
            </button>
          )}
          <CommitMessageButton issueKey={subtask.key} />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            title={`Log giờ vào ${dateLabel}`}
            className={
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-small font-semibold transition-colors " +
              (open
                ? "border border-line-strong bg-surface text-ink-2 hover:bg-surface-2"
                : isToday
                  ? "bg-accent text-on-accent shadow-card hover:bg-accent-2"
                  : "bg-ot text-white shadow-card hover:brightness-110")
            }
          >
            {pending ? (
              <Spinner className="size-3" />
            ) : open ? (
              "Đóng"
            ) : (
              <>
                <span className="text-body leading-none">+</span> Log
              </>
            )}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-dashed border-line bg-surface-2/50 py-3 pl-[44px] pr-4">
          <LogStrip
            isToday={isToday}
            dateLabel={dateLabel}
            presets={presets}
            step={step}
            dayLoggedMinutes={dayLoggedMinutes}
            dayQuotaHours={dayQuotaHours}
            schedule={schedule}
            dayOff={dayOff}
            pending={pending}
            onLog={submit}
            onOpenCalendar={() => setCalendarOpen(true)}
            warning={
              pastDue
                ? `⚠ ${subtask.key} đã Done, due ${subtask.dueDate} — ngày này nằm sau đó`
                : undefined
            }
          />
        </div>
      )}

      {calendarOpen && (
        <WorklogCalendarDialog
          issueKey={subtask.key}
          summary={subtask.summary}
          initialMonth={date.slice(0, 7)}
          initialDay={date}
          presets={presets}
          step={step}
          onClose={() => setCalendarOpen(false)}
        />
      )}

      {detailOpen && (
        <IssueDetail
          issueKey={subtask.key}
          onClose={() => setDetailOpen(false)}
        />
      )}

      {result && (
        <p
          className={
            "flex flex-wrap items-center pb-2.5 pl-[44px] pr-4 text-small " +
            (result.ok ? "text-good" : "text-crit")
          }
        >
          {result.message}
          {result.ok && undo && (
            <button
              type="button"
              onClick={takeBack}
              disabled={undoing}
              className="ml-2 rounded-md border border-line-strong bg-surface px-2 py-0.5 text-caption font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-60"
            >
              {undoing ? "Đang hoàn tác…" : "↶ Hoàn tác"}
            </button>
          )}
          {/* Said at the moment it happened, once. A permanent mark on every
              Done row whose due date has passed would be on most rows most
              days, and a warning that is always on is not read. */}
          {result.ok && pastDue && (
            <span className="text-warn">
              {" · ⚠ ngày này sau due date "}
              {subtask.dueDate}
              {" của task đã Done"}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
