/**
 * Shared skeleton pieces.
 *
 * These mirror the real layout closely enough that nothing jumps when the data
 * arrives — a spinner in the middle of an empty page would reflow everything.
 */

export function Shimmer({ className = '' }: { className?: string }) {
  return <div className={'animate-pulse rounded bg-surface-2 ' + className} />
}

export function HeaderSkeleton({ withPicker = true }: { withPicker?: boolean }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <Shimmer className="h-3 w-56" />
        <Shimmer className="h-6 w-40" />
        <Shimmer className="h-3 w-72" />
      </div>
      {withPicker && (
        <div className="flex flex-col items-end gap-1.5">
          <Shimmer className="h-2.5 w-24" />
          <Shimmer className="h-[30px] w-[240px]" />
        </div>
      )}
    </header>
  )
}

export function CardSkeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <section className={'rounded-[9px] border border-line bg-surface p-[17px] ' + className}>
      <Shimmer className="mb-3 h-2.5 w-32" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }, (_, i) => (
          <Shimmer key={i} className="h-3.5" />
        ))}
      </div>
    </section>
  )
}

export function SideSkeleton() {
  return (
    <aside className="flex flex-col gap-3.5">
      <CardSkeleton lines={7} />
      <CardSkeleton lines={4} />
    </aside>
  )
}

export function LoadingNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-3">
      <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
      {children}
    </p>
  )
}
