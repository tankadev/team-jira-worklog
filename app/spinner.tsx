/**
 * Inline spinner. Inherits `currentColor`, so it reads correctly on a coloured
 * button as well as on plain text without needing a variant per placement.
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={
        'inline-block size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current/30 border-t-current ' +
        className
      }
    />
  )
}

/** Spinner plus label, for buttons that swap their text while working. */
export function Working({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Spinner />
      {children}
    </span>
  )
}
