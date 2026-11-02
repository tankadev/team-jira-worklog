import Link from 'next/link'

import {
  COUNT_OPTIONS,
  SIZE_LABEL,
  SIZE_ORDER,
  type SizeKey,
  type SprintReview,
  fmtNum,
  hoursPerPoint,
  pct,
  totalReviews,
} from '@/lib/modules/self-review/model'
import { formatDuration } from '@/lib/time'

import { type Column, type Series, StackedColumns } from './charts'

/**
 * Status series, in workflow order from the baseline up: closed work sits at the
 * bottom, what is still open on top. Same tones as the board's points panel.
 */
const STATUS_SERIES: Series[] = [
  { key: 'done', label: 'Done', color: 'var(--good)' },
  { key: 'ver', label: 'Đã verify', color: 'var(--blue-ink)' },
  { key: 'active', label: 'Đang làm / chờ test', color: 'var(--accent)' },
  { key: 'todo', label: 'Chưa làm', color: 'var(--line-strong)' },
]

/** Task sizes, smallest at the baseline. Unpointed is the neutral remainder. */
const SIZE_COLOR: Record<SizeKey, string> = {
  '1': 'var(--blue-ink)',
  '2': 'var(--orange)',
  '3': 'var(--accent)',
  other: 'var(--ot)',
  none: 'var(--line-strong)',
}
const SIZE_SERIES: Series[] = SIZE_ORDER.map((k) => ({ key: k, label: SIZE_LABEL[k], color: SIZE_COLOR[k] }))

function dm(iso: string | null) {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '?'
}

function titleOf(r: SprintReview) {
  return `${r.name} · ${dm(r.start)} – ${dm(r.end)}`
}

export function Review({ reviews, count }: { reviews: SprintReview[]; count: number }) {
  const totals = totalReviews(reviews)
  const hpp = hoursPerPoint(totals)

  const statusColumns: Column[] = reviews.map((r) => ({
    key: String(r.id),
    label: r.label,
    title: titleOf(r),
    highlight: r.current,
    values: { done: r.donePoints, ver: r.verifiedPoints, active: r.activePoints, todo: r.todoPoints },
  }))
  const sizeColumns: Column[] = reviews.map((r) => ({
    key: String(r.id),
    label: r.label,
    title: titleOf(r),
    highlight: r.current,
    values: Object.fromEntries(SIZE_ORDER.map((k) => [k, r.sizes[k].tasks])),
  }))
  const hppColumns: Column[] = reviews.map((r) => ({
    key: String(r.id),
    label: r.label,
    title: titleOf(r),
    highlight: r.current,
    values: { hpp: Math.round((hoursPerPoint(r) ?? 0) * 10) / 10 },
  }))

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow text-ink-2">
            {reviews.length} sprint gần nhất · subtask giao cho bạn
          </div>
          <h1 className="text-title font-semibold tracking-tight">Đánh giá cá nhân</h1>
          <p className="mt-1 text-body text-ink-3">
            Point và số task theo từng sprint, để so sprint này với các sprint trước.
          </p>
        </div>
        {/* The one filter, in a row above everything it scopes. */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-1 text-small">
          <span className="px-1.5 text-ink-3">Xem</span>
          {COUNT_OPTIONS.map((n) => (
            <Link
              key={n}
              href={n === count ? '#' : `/m/self-review?n=${n}`}
              aria-current={n === count ? 'true' : undefined}
              className={
                'rounded-md px-2.5 py-1 font-medium ' +
                (n === count ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2')
              }
            >
              {n}
            </Link>
          ))}
          <span className="px-1.5 text-ink-3">sprint</span>
        </div>
      </header>

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface p-6 text-center text-body text-ink-3">
          Chưa có sprint nào đã bắt đầu trên board.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile
              label="Point đã Done"
              value={fmtNum(totals.donePoints)}
              sub={`/ ${fmtNum(totals.points)} point trong ${totals.sprints} sprint · ${pct(totals.donePoints, totals.points)}%`}
              hero
            />
            <Tile label="Point Done mỗi sprint" value={fmtNum(totals.avgDonePoints)} sub="trung bình" />
            <Tile label="Task đã Done" value={String(totals.doneTasks)} sub={`/ ${totals.tasks} task`} />
            <Tile
              label="Giờ cho mỗi point"
              value={hpp === null ? '—' : fmtNum(hpp)}
              sub={`${formatDuration(totals.pointedSeconds)} trên task có point`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <div className="eyebrow mb-1 text-ink-2">Point theo sprint</div>
              <p className="mb-3 text-caption text-ink-3">
                Tổng point của subtask giao cho bạn, chia theo trạng thái hiện tại.
              </p>
              <StackedColumns
                series={STATUS_SERIES}
                columns={statusColumns}
                unit=" point"
                ariaLabel="Point theo sprint, chia theo trạng thái"
              />
            </section>

            <section className="card p-4">
              <div className="eyebrow mb-1 text-ink-2">Số task theo cỡ point</div>
              <p className="mb-3 text-caption text-ink-3">
                Mỗi sprint có bao nhiêu task 1 / 2 / 3 point — Done hay chưa đều tính.
              </p>
              <StackedColumns
                series={SIZE_SERIES}
                columns={sizeColumns}
                unit=" task"
                ariaLabel="Số task theo cỡ point mỗi sprint"
              />
            </section>

            <section className="card p-4">
              <div className="eyebrow mb-1 text-ink-2">Giờ cho mỗi point</div>
              <p className="mb-3 text-caption text-ink-3">
                Giờ đã log trên task có point, chia cho tổng point. Theo quy ước của team 1 point ≈ 1–2h.
              </p>
              <StackedColumns
                series={[{ key: 'hpp', label: 'Giờ / point', color: 'var(--accent)' }]}
                columns={hppColumns}
                unit="h"
                height={170}
                ariaLabel="Giờ cho mỗi point theo sprint"
              />
            </section>
          </div>

          <section className="card overflow-x-auto p-4">
            <div className="eyebrow mb-3 text-ink-2">Bảng số liệu</div>
            <table className="w-full min-w-[720px] text-small">
              <thead className="text-caption text-ink-3">
                <tr className="border-b border-line text-left">
                  <th className="pb-2 pr-3 font-medium">Sprint</th>
                  <th className="pb-2 pr-3 text-right font-medium">Point Done</th>
                  <th className="pb-2 pr-3 text-right font-medium">Tổng point</th>
                  {SIZE_ORDER.map((k) => (
                    <th key={k} className="pb-2 pr-3 text-right font-medium">
                      {SIZE_LABEL[k]}
                    </th>
                  ))}
                  <th className="pb-2 pr-3 text-right font-medium">Giờ đã log</th>
                  <th className="pb-2 text-right font-medium">Giờ / point</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {[...reviews].reverse().map((r) => (
                  <tr key={r.id} className={'border-b border-line ' + (r.current ? 'bg-accent-soft/30' : '')}>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-ink">{r.name}</span>
                      <span className="ml-2 whitespace-nowrap font-mono text-caption text-ink-3">
                        {dm(r.start)} – {dm(r.end)}
                      </span>
                      {r.current && (
                        <span className="ml-2 rounded-full bg-accent-soft px-1.5 py-px text-micro font-medium text-accent-ink">
                          đang chạy
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-3 text-right font-mono">
                      <b className="font-semibold">{fmtNum(r.donePoints)}</b>
                      <span className="ml-1 text-caption text-ink-3">{pct(r.donePoints, r.points)}%</span>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono">{fmtNum(r.points)}</td>
                    {SIZE_ORDER.map((k) => (
                      <td key={k} className="whitespace-nowrap py-2 pr-3 text-right font-mono">
                        <SizeCell done={r.sizes[k].done} tasks={r.sizes[k].tasks} />
                      </td>
                    ))}
                    <td className="py-2 pr-3 text-right font-mono">{formatDuration(r.seconds)}</td>
                    <td className="py-2 text-right font-mono">
                      {hoursPerPoint(r) === null ? '—' : fmtNum(hoursPerPoint(r)!)}
                    </td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2 pr-3">Tổng {totals.sprints} sprint</td>
                  <td className="py-2 pr-3 text-right font-mono">
                    <b className="font-semibold">{fmtNum(totals.donePoints)}</b>
                    <span className="ml-1 text-caption text-ink-3">{pct(totals.donePoints, totals.points)}%</span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">{fmtNum(totals.points)}</td>
                  {SIZE_ORDER.map((k) => (
                    <td key={k} className="whitespace-nowrap py-2 pr-3 text-right font-mono">
                      <SizeCell done={totals.sizes[k].done} tasks={totals.sizes[k].tasks} />
                    </td>
                  ))}
                  <td className="py-2 pr-3 text-right font-mono">{formatDuration(totals.seconds)}</td>
                  <td className="py-2 text-right font-mono">{hpp === null ? '—' : fmtNum(hpp)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-caption text-ink-3">
              Cột cỡ point ghi <span className="font-mono">Done / tổng</span> task. Point Done chỉ tính trạng thái
              Done của Jira — task đã verify nhưng chưa đóng vẫn nằm ngoài.
            </p>
          </section>
        </div>
      )}
    </>
  )
}

function SizeCell({ done, tasks }: { done: number; tasks: number }) {
  if (!tasks) return <span className="text-ink-3">—</span>
  return (
    <>
      <span className={done === tasks ? 'text-good' : ''}>{done}</span>
      <span className="text-ink-3"> / {tasks}</span>
    </>
  )
}

function Tile({ label, value, sub, hero }: { label: string; value: string; sub: string; hero?: boolean }) {
  return (
    <div className={'card p-4 ' + (hero ? 'col-span-2 md:col-span-1' : '')}>
      <div className="text-caption text-ink-3">{label}</div>
      <div
        className={
          'mt-1 font-semibold leading-none tracking-[-0.03em] ' + (hero ? 'text-[44px]' : 'text-[28px]')
        }
      >
        {value}
      </div>
      <div className="mt-1.5 text-caption text-ink-3">{sub}</div>
    </div>
  )
}
