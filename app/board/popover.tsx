'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Small anchored panel for controls that would otherwise sit in the row.
 *
 * The compact row only has space for what gets used on every log — hours and the
 * Log button. Story points and the worklog note are edited occasionally, so they
 * live behind a chip and open here instead of taking permanent width.
 */
export function Popover({
  trigger,
  children,
  align = 'right',
  panelClassName = '',
  onOpenChange,
}: {
  /** Rendered inline; receives whether the panel is open. */
  trigger: (open: boolean) => React.ReactNode
  children: (close: () => void) => React.ReactNode
  align?: 'left' | 'right'
  panelClassName?: string
  onOpenChange?: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    onOpenChange?.(open)
    if (!open) return

    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    // `mousedown` rather than `click`, so pressing outside dismisses before the
    // click lands on whatever is underneath.
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <span ref={rootRef} className="relative inline-flex">
      <span onClick={() => setOpen((v) => !v)}>{trigger(open)}</span>

      {open && (
        <div
          className={
            'absolute top-[calc(100%+6px)] z-50 rounded-lg border border-line-strong bg-surface p-2.5 shadow-lg ' +
            (align === 'right' ? 'right-0' : 'left-0') +
            ' ' +
            panelClassName
          }
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  )
}

export function PopoverTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.07em] text-ink-3">
      {children}
    </div>
  )
}
