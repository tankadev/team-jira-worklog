'use client'

import { createContext, useContext, useState } from 'react'

/**
 * Folds an epic or a parent task down to its header.
 *
 * Only the title toggles, not the whole header: the header also carries the
 * status pill, points and "+ Task cha", and a click on one of those must not
 * fold the card away from under the pointer.
 *
 * The body is hidden rather than unmounted, so hours typed into a row survive
 * folding and unfolding it.
 */
const FoldContext = createContext<{ open: boolean; toggle: () => void }>({
  open: true,
  toggle: () => {},
})

export function Collapsible({
  as: Tag = 'div',
  className = '',
  children,
}: {
  as?: 'div' | 'section' | 'article'
  className?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)

  return (
    <FoldContext.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
      <Tag data-collapsed={open ? undefined : ''} className={'group/fold ' + className}>
        {children}
      </Tag>
    </FoldContext.Provider>
  )
}

export function CollapseTrigger({
  className = '',
  title,
  children,
}: {
  className?: string
  title?: string
  children: React.ReactNode
}) {
  const { open, toggle } = useContext(FoldContext)

  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={open}
      title={title ? `${title} — bấm để ${open ? 'thu gọn' : 'mở rộng'}` : open ? 'Thu gọn' : 'Mở rộng'}
      className={'flex w-full min-w-0 items-baseline gap-1.5 text-left hover:opacity-80 ' + className}
    >
      <span
        aria-hidden
        className={
          'inline-block shrink-0 text-[9px] text-ink-3 transition-transform ' + (open ? 'rotate-90' : '')
        }
      >
        ▶
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  )
}

export function CollapseBody({ className = '', children }: { className?: string; children: React.ReactNode }) {
  const { open } = useContext(FoldContext)
  return (
    <div hidden={!open} className={className}>
      {children}
    </div>
  )
}
