'use client'

import { useState } from 'react'

import { fmtNum } from '@/lib/modules/self-review/model'

export interface Series {
  key: string
  label: string
  /** A CSS colour, normally one of the theme tokens: `var(--good)`. */
  color: string
}

export interface Column {
  key: string
  /** Under the axis: short, `S72`. */
  label: string
  /** In the tooltip: the full sprint name and dates. */
  title: string
  values: Record<string, number>
  /** The sprint running now — drawn with a stronger axis label. */
  highlight?: boolean
}

// Geometry in viewBox units, which are pixels at full width.
const BAND = 56
const BAR = 24
const LEFT = 34
const RIGHT = 8
const TOP = 22
const BOTTOM = 24

/** Round a value up to a clean tick step: 1 / 2 / 5 × 10ⁿ. */
function niceStep(max: number): number {
  if (max <= 0) return 1
  const raw = max / 4
  const exp = 10 ** Math.floor(Math.log10(raw))
  const f = raw / exp
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp
}

/** A rect whose top corners are rounded; the bottom stays square. */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h / 2, w / 2)
  return [
    `M${x},${y + h}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h}`,
    'Z',
  ].join(' ')
}

/**
 * Stacked columns, one per sprint, every series in one fixed colour order.
 *
 * Thin bars on a single baseline, a 2px surface gap between stacked segments,
 * the total on each cap and nothing else labelled — the legend, the tooltip and
 * the table under the charts carry the per-series numbers. Hovering a column
 * lights it and shows every series at once.
 */
export function StackedColumns({
  series,
  columns,
  unit = '',
  height = 200,
  ariaLabel,
}: {
  series: Series[]
  columns: Column[]
  /** Appended to values in the tooltip: `h`, ` point`. */
  unit?: string
  height?: number
  ariaLabel: string
}) {
  const [hover, setHover] = useState<number | null>(null)

  const totals = columns.map((c) => series.reduce((n, s) => n + (c.values[s.key] ?? 0), 0))
  const max = Math.max(0, ...totals)
  const step = niceStep(max)
  const ticks: number[] = []
  for (let t = step; t < max + step; t += step) ticks.push(t)
  const yMax = ticks[ticks.length - 1] ?? step

  const W = LEFT + columns.length * BAND + RIGHT
  const H = height
  const plotH = H - TOP - BOTTOM
  const y = (v: number) => TOP + plotH - (v / yMax) * plotH
  const cx = (i: number) => LEFT + i * BAND + BAND / 2

  const hovered = hover === null ? null : columns[hover]

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: W, display: 'block' }}
        role="img"
        aria-label={ariaLabel}
        className="select-none"
        onMouseLeave={() => setHover(null)}
      >
        {/* Gridlines, hairline and recessive, with their tick values. */}
        {[0, ...ticks].map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
            <text x={LEFT - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--ink-3)">
              {fmtNum(t)}
            </text>
          </g>
        ))}

        {columns.map((c, i) => {
          const x = cx(i) - BAR / 2
          const nonZero = series.filter((s) => (c.values[s.key] ?? 0) > 0)
          let acc = 0
          const dim = hover !== null && hover !== i
          return (
            <g key={c.key} opacity={dim ? 0.55 : 1} style={{ transition: 'opacity 120ms' }}>
              {nonZero.map((s, j) => {
                const v = c.values[s.key] ?? 0
                const y0 = y(acc)
                acc += v
                const y1 = y(acc)
                const isTop = j === nonZero.length - 1
                const isBottom = j === 0
                const top = y1 + (isTop ? 0 : 1)
                const bottom = y0 - (isBottom ? 0 : 1)
                const h = Math.max(0, bottom - top)
                if (h <= 0) return null
                return isTop ? (
                  <path key={s.key} d={topRounded(x, top, BAR, h, 4)} fill={s.color} />
                ) : (
                  <rect key={s.key} x={x} y={top} width={BAR} height={h} fill={s.color} />
                )
              })}
              {totals[i] > 0 && (
                <text
                  x={cx(i)}
                  y={y(totals[i]) - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--ink-2)"
                >
                  {fmtNum(totals[i])}
                </text>
              )}
              <text
                x={cx(i)}
                y={H - 7}
                textAnchor="middle"
                fontSize={11}
                fontWeight={c.highlight ? 600 : 400}
                fill={c.highlight ? 'var(--ink)' : 'var(--ink-3)'}
              >
                {c.label}
              </text>
              {/* The whole band is the hit target, not just the painted bar. */}
              <rect
                x={LEFT + i * BAND}
                y={TOP - 10}
                width={BAND}
                height={H - TOP + 10}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${c.title}: ${fmtNum(totals[i])}${unit}`}
              />
            </g>
          )
        })}
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 w-max max-w-[260px] rounded-lg border border-line bg-surface px-2.5 py-2 text-caption shadow-[var(--elev-pop)]"
          style={{
            left: `${(cx(hover) / W) * 100}%`,
            transform: `translateX(${hover >= columns.length - 1 && columns.length > 2 ? '-100%' : hover === 0 ? '0' : '-50%'})`,
          }}
        >
          <div className="mb-1 font-medium text-ink">{hovered.title}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-2 whitespace-nowrap py-px">
              <span aria-hidden className="h-[2px] w-3 shrink-0 rounded-full" style={{ background: s.color }} />
              <b className="font-mono tabular text-ink">
                {fmtNum(hovered.values[s.key] ?? 0)}
                {unit}
              </b>
              <span className="text-ink-3">{s.label}</span>
            </div>
          ))}
          {series.length > 1 && (
            <div className="mt-1 flex items-center gap-2 border-t border-line pt-1">
              <span className="w-3 shrink-0" />
              <b className="font-mono tabular text-ink">
                {fmtNum(totals[hover])}
                {unit}
              </b>
              <span className="text-ink-3">tổng</span>
            </div>
          )}
        </div>
      )}

      {series.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-2">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
