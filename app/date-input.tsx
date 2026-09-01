'use client'

import { useRef } from 'react'

/**
 * A date field that opens its calendar on any click, not just on the tiny icon.
 *
 * A bare `<input type="date">` only drops the calendar when the 16px glyph at
 * its right edge is hit; clicking the text lands the caret in a segment and
 * leaves the user typing digits. `showPicker()` is the supported way to ask for
 * it directly — the same call the board's own day picker uses.
 *
 * Every call is guarded: the method throws `NotAllowedError` without transient
 * user activation and `InvalidStateError` when the picker is already open, and
 * neither is a problem worth surfacing — the field still works as a plain input.
 */
export function DateInput({
  value,
  onChange,
  min,
  max,
  className = '',
  'aria-label': ariaLabel,
}: {
  /** YYYY-MM-DD, or '' for empty. */
  value: string
  /** Receives '' when the field is cleared. */
  onChange: (value: string) => void
  min?: string
  max?: string
  className?: string
  'aria-label'?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  function openCalendar() {
    const el = ref.current
    if (!el || typeof el.showPicker !== 'function') return
    try {
      el.showPicker()
    } catch {
      // Left as an ordinary date field — typing still works.
    }
  }

  return (
    <input
      ref={ref}
      type="date"
      value={value}
      min={min}
      max={max}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      onClick={openCalendar}
      // Enter or Space on a focused field is the keyboard equivalent of the
      // click above; arrow keys keep editing segments as they normally do.
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openCalendar()
        }
      }}
      className={'cursor-pointer ' + className}
    />
  )
}
