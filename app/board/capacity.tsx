import { formatDuration } from '@/lib/time'

interface Entry {
  key: string
  seconds: number
}

/**
 * The day as a capacity bar, not a timeline.
 *
 * There is deliberately no clock: this team only checks that a day totals eight
 * hours, never when the work happened, so segments are sized by proportion and
 * carry no start time. Order is meaningless.
 */
export function CapacityBar({
  quotaHours,
  isWeekend,
  entries,
}: {
  date: string
  quotaHours: number
  isWeekend: boolean
  entries: Entry[]
}) {
  const merged = new Map<string, number>()
  for (const e of entries) merged.set(e.key, (merged.get(e.key) ?? 0) + e.seconds)

  const segments = [...merged].map(([key, seconds]) => ({ key, seconds }))
  const logged = segments.reduce((n, s) => n + s.seconds, 0)
  const quota = quotaHours * 3600

  // When the day runs over quota the bar rescales to the total, so overtime is
  // visible instead of clipped.
  const capacity = quota > 0 ? Math.max(quota, logged) : Math.max(logged, 1)
  const remaining = Math.max(0, quota - logged)
  const short = quota > 0 && logged < quota

  return (
    <section className="mb-3.5 rounded-[9px] border border-line bg-surface px-[17px] pb-[15px] pt-3.5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3.5">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[25px] font-medium tracking-[-0.03em] tabular">
            {(logged / 3600).toFixed(logged % 3600 === 0 ? 0 : 1)}
          </span>
          {quota > 0 && <span className="font-mono text-[13px] text-ink-3">/ {quotaHours}h</span>}

          {isWeekend && quota === 0 && (
            <span className="rounded-full bg-ot-soft px-2 py-[2.5px] text-[11.5px] font-medium text-ot">
              Cuối tuần · không có định mức
            </span>
          )}
          {short && (
            <span className="rounded-full bg-warn-soft px-2 py-[2.5px] text-[11.5px] font-medium text-warn">
              Thiếu {formatDuration(remaining)}
            </span>
          )}
          {quota > 0 && logged > quota && (
            <span className="rounded-full bg-ot-soft px-2 py-[2.5px] text-[11.5px] font-medium text-ot">
              OT {formatDuration(logged - quota)}
            </span>
          )}
        </div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
          Đủ {quotaHours || 0}h là đạt · không cần đúng mốc giờ
        </div>
      </div>

      {segments.length === 0 && remaining === 0 ? (
        <p className="text-[12.5px] text-ink-3">Chưa log giờ nào cho ngày này.</p>
      ) : (
        <div className="flex h-[34px] gap-0.5">
          {segments.map((s, i) => (
            <div
              key={s.key}
              title={`${s.key} · ${formatDuration(s.seconds)}`}
              style={{ width: `${(s.seconds / capacity) * 100}%` }}
              className={
                'flex min-w-0 items-center overflow-hidden whitespace-nowrap rounded-[3px] px-2 text-white ' +
                (isWeekend ? 'bg-ot' : i % 2 ? 'bg-accent-2' : 'bg-accent')
              }
            >
              <b className="font-mono text-[11px] font-semibold">
                {s.key} · {formatDuration(s.seconds)}
              </b>
            </div>
          ))}
          {remaining > 0 && (
            <div
              style={{ width: `${(remaining / capacity) * 100}%` }}
              className="flex min-w-0 items-center justify-center overflow-hidden rounded-[3px] border border-dashed border-line-strong px-2"
            >
              <b className="font-mono text-[11px] font-medium text-ink-3">
                còn {formatDuration(remaining)}
              </b>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
