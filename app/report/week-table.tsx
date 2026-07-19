import { formatDuration, isWeekend } from '@/lib/time'

const VI_DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function label(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${VI_DAYS[dow]} · ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}

export function WeekTable({
  days,
  today,
  secondsByDate,
  quotaHours,
  weekendCounts,
}: {
  days: string[]
  today: string
  secondsByDate: Record<string, number>
  quotaHours: number
  weekendCounts: boolean
}) {
  const total = days.reduce((n, d) => n + (secondsByDate[d] ?? 0), 0)

  return (
    <>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="border-b border-line pb-[7px] text-left font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3">
              Ngày
            </th>
            <th className="w-[44%] border-b border-line pb-[7px]" />
            <th className="border-b border-line pb-[7px] text-right font-mono text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3">
              Giờ
            </th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const seconds = secondsByDate[d] ?? 0
            const quota = isWeekend(d) && !weekendCounts ? 0 : quotaHours
            const pct = quota > 0 ? Math.min(100, seconds / (quota * 36)) : seconds > 0 ? 100 : 0
            const tone =
              quota === 0
                ? 'bg-ot'
                : seconds > quota * 3600
                  ? 'bg-ot'
                  : seconds < quota * 3600
                    ? 'bg-warn'
                    : 'bg-accent'

            return (
              <tr key={d}>
                <td
                  className={
                    'border-b border-line py-[7px] ' +
                    (d === today ? 'font-semibold' : quota === 0 ? 'text-ot' : '')
                  }
                >
                  {label(d)}
                </td>
                <td className="border-b border-line py-[7px]">
                  <div className="h-[5px] overflow-hidden rounded-[3px] bg-surface-2">
                    <div className={'h-full ' + tone} style={{ width: `${pct}%` }} />
                  </div>
                </td>
                <td
                  className={
                    'border-b border-line py-[7px] text-right font-mono tabular ' +
                    (seconds ? '' : 'text-ink-3')
                  }
                >
                  {seconds ? formatDuration(seconds) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="mt-2.5 flex justify-between border-t border-line pt-2.5 font-mono text-xs">
        <span className="text-ink-3">Tổng tuần</span>
        <b className="tabular">{formatDuration(total)}</b>
      </div>
    </>
  )
}
