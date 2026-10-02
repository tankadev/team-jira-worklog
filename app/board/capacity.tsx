import { formatDuration } from '@/lib/time'

interface Entry {
  key: string
  seconds: number
}

/**
 * The day as a capacity bar, sized for the sidebar.
 *
 * Moved out of the middle column: it is a summary, read once, while the task
 * list below it is worked through continuously — so the list gets the space and
 * this sits alongside the sprint figures it belongs with.
 *
 * There is deliberately no clock. This team only checks that a day totals eight
 * hours, never when the work happened, so segments are sized by proportion and
 * their order carries no meaning.
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

  // When the day runs over quota the bar rescales to the total, so overtime
  // shows rather than being clipped.
  const capacity = quota > 0 ? Math.max(quota, logged) : Math.max(logged, 1)
  const remaining = Math.max(0, quota - logged)
  const short = quota > 0 && logged < quota

  return (
    <section className="card p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="eyebrow text-ink-2">Giờ đã log trong ngày</span>
        <span className="ml-auto">
          {isWeekend && quota === 0 && (
            <span className="rounded-full bg-ot-soft px-2 py-[2px] text-caption font-medium text-ot">
              OT cuối tuần
            </span>
          )}
          {short && (
            <span className="rounded-full bg-warn-soft px-2 py-[2px] text-caption font-medium text-warn">
              thiếu {formatDuration(remaining)}
            </span>
          )}
          {quota > 0 && logged > quota && (
            <span className="rounded-full bg-ot-soft px-2 py-[2px] text-caption font-medium text-ot">
              OT {formatDuration(logged - quota)}
            </span>
          )}
          {quota > 0 && logged === quota && (
            <span className="rounded-full bg-good-soft px-2 py-[2px] text-caption font-medium text-good">
              đủ giờ ✓
            </span>
          )}
        </span>
      </div>

      <div className="mb-3 flex items-baseline gap-1.5">
        <span className="text-[32px] font-semibold leading-none tracking-[-0.03em] tabular">
          {(logged / 3600).toFixed(logged % 3600 === 0 ? 0 : 1)}
          <span className="text-lead font-medium text-ink-3">h</span>
        </span>
        {quota > 0 && <span className="text-body text-ink-3">/ {quotaHours}h</span>}
      </div>

      {segments.length === 0 && remaining === 0 ? (
        <p className="text-small text-ink-3">Chưa log giờ nào cho ngày này.</p>
      ) : (
        <>
          {/* A track the segments fill, rather than a dashed box for what is
              left — an empty day used to look like a broken placeholder. */}
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-surface-2">
            {segments.map((s, i) => (
              <div
                key={s.key}
                title={`${s.key} · ${formatDuration(s.seconds)}`}
                style={{ width: `${(s.seconds / capacity) * 100}%` }}
                className={
                  'min-w-0 first:rounded-l-full last:rounded-r-full ' +
                  (isWeekend ? 'bg-ot' : i % 2 ? 'bg-accent-2' : 'bg-accent')
                }
              />
            ))}
          </div>

          {segments.length === 0 && (
            <p className="mt-2.5 text-small text-ink-3">Chưa log giờ nào cho ngày này.</p>
          )}

          {/* The bar is too narrow for in-segment labels at this width, so the
              breakdown goes underneath as a legend. */}
          {segments.length > 0 && (
            <div className="mt-3 flex flex-col gap-1.5">
              {segments.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2 text-small">
                  <i
                    className={
                      'inline-block size-2 shrink-0 rounded-full ' +
                      (isWeekend ? 'bg-ot' : i % 2 ? 'bg-accent-2' : 'bg-accent')
                    }
                  />
                  <span className="truncate font-mono text-ink-2">{s.key}</span>
                  <span className="ml-auto font-mono tabular text-ink-3">{formatDuration(s.seconds)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
