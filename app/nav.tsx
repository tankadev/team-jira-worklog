'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const ITEMS = [
  { href: '/', label: 'Task board' },
  { href: '/find', label: 'Tìm & nhận task' },
  { href: '/new', label: 'Task mới' },
  { href: '/report', label: 'Report' },
  { href: '/settings', label: 'Settings' },
]

export function Nav({ label }: { label?: string }) {
  const pathname = usePathname()

  return (
    <aside className="flex flex-row items-center gap-5 border-b border-line bg-surface px-3 py-4 md:flex-col md:items-stretch md:border-b-0 md:border-r">
      <div className="px-2">
        <b className="block text-[15px] font-semibold tracking-tight">Jira Logwork</b>
        {label && <span className="font-mono text-[10.5px] text-ink-3">{label}</span>}
      </div>

      <nav className="flex flex-1 flex-row gap-px md:flex-none md:flex-col">
        {ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              // These pages all read live Jira data, so prefetching would fire
              // requests for screens the user may never open.
              prefetch={false}
              aria-current={active ? 'page' : undefined}
              className={
                'flex items-center justify-between gap-2 rounded-md px-[9px] py-[7px] text-sm transition-colors ' +
                (active
                  ? 'bg-accent-soft font-semibold text-accent-ink'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink')
              }
            >
              {item.label}
              <LinkSpinner />
            </Link>
          )
        })}
      </nav>

      <div className="md:mt-auto md:px-2">
        <ThemeToggle />
      </div>
    </aside>
  )
}

/**
 * Pending indicator for the link that was clicked.
 *
 * Every page here waits on Jira, so a click can sit for a second or two with no
 * feedback. `useLinkStatus` only reports for the Link it is rendered inside, so
 * the spinner appears on the item the user actually chose rather than all of
 * them.
 */
function LinkSpinner() {
  const { pending } = useLinkStatus()
  if (!pending) return null
  return (
    <span
      aria-hidden
      className="inline-block size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent"
    />
  )
}

/**
 * Writes data-theme on <html>, which the CSS treats as the highest-priority
 * override so it wins over prefers-color-scheme in both directions.
 */
function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.dataset.theme = stored
      setTheme(stored)
    }
  }, [])

  function toggle() {
    const current =
      document.documentElement.dataset.theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem('theme', next)
    setTheme(next)
  }

  return (
    <button
      onClick={toggle}
      className="w-full rounded-md border border-line px-[9px] py-[5px] text-left text-xs text-ink-2 hover:border-line-strong hover:text-ink"
    >
      ◐ {theme === 'dark' ? 'Nền tối' : theme === 'light' ? 'Nền sáng' : 'Giao diện'}
    </button>
  )
}
