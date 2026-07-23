'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'

import { refreshDataAction } from './refresh-actions'

// Core stays fixed; Settings sits at the end. Enabled modules slot in between,
// under their own heading, via the `modules` prop the server layout supplies.
const CORE = [
  { href: '/', label: 'Task board' },
  { href: '/find', label: 'Tìm & nhận task' },
  { href: '/new', label: 'Task mới' },
  { href: '/report', label: 'Daily report' },
]

export function Nav({
  label,
  modules = [],
}: {
  label?: string
  modules?: Array<{ href: string; label: string }>
}) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <aside className="flex flex-row items-center gap-5 border-b border-line bg-surface px-3 py-4 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:border-b-0 md:border-r">
      <div className="flex items-center gap-2 px-2">
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] font-semibold tracking-tight">Jira Logwork</b>
          {label && <span className="font-mono text-[10.5px] text-ink-3">{label}</span>}
        </div>
        {/* Beside the brand rather than pinned to the bottom: with `mt-auto` on a
            full-height column it drifted to the end of a long board, out of reach
            without scrolling back. */}
        <RefreshButton />
        <ThemeToggle />
      </div>

      <nav className="flex flex-1 flex-row gap-px md:flex-none md:flex-col">
        {CORE.map((item) => (
          <NavLink key={item.href} href={item.href} label={item.label} active={isActive(item.href)} />
        ))}

        {modules.length > 0 && (
          <>
            <div className="mt-3 hidden px-[9px] pb-1 font-mono text-[9.5px] uppercase tracking-[0.09em] text-ink-3 md:block">
              Modules
            </div>
            {modules.map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} active={isActive(item.href)} />
            ))}
          </>
        )}

        <div className="mt-3 hidden md:block" />
        <NavLink href="/settings" label="Settings" active={isActive('/settings')} />
      </nav>
    </aside>
  )
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  const router = useRouter()
  return (
    <Link
      href={href}
      // Auto-prefetch stays off (it would fire Jira requests for every screen).
      // Instead we warm just the one the pointer lands on — an intent signal —
      // so the click feels instant without prefetching the whole nav.
      prefetch={false}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      aria-current={active ? 'page' : undefined}
      className={
        'flex items-center justify-between gap-2 rounded-md px-[9px] py-[7px] text-sm transition-colors ' +
        (active
          ? 'bg-accent-soft font-semibold text-accent-ink'
          : 'text-ink-2 hover:bg-surface-2 hover:text-ink')
      }
    >
      {label}
      <LinkSpinner />
    </Link>
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

/** Drops the short Jira read cache and re-renders — the "give me live data now" button. */
function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function refresh() {
    startTransition(async () => {
      await refreshDataAction()
      router.refresh()
    })
  }

  return (
    <button
      onClick={refresh}
      disabled={pending}
      title="Làm mới dữ liệu Jira"
      aria-label="Làm mới dữ liệu Jira"
      className="grid size-7 shrink-0 place-items-center rounded-md border border-line text-ink-3 hover:border-line-strong hover:text-ink disabled:opacity-60"
    >
      <span className={'text-[15px] leading-none ' + (pending ? 'inline-block animate-spin' : '')}>↻</span>
    </button>
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

  const isDark =
    theme === 'dark' ||
    (theme === null && typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)

  return (
    <button
      onClick={toggle}
      title={isDark ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
      aria-label={isDark ? 'Chuyển sang nền sáng' : 'Chuyển sang nền tối'}
      className="grid size-7 shrink-0 place-items-center rounded-md border border-line text-ink-3 hover:border-line-strong hover:text-ink"
    >
      {isDark ? (
        <svg viewBox="0 0 16 16" className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="8" cy="8" r="3.1" />
          <path d="M8 1.4v1.7M8 12.9v1.7M14.6 8h-1.7M3.1 8H1.4M12.67 3.33l-1.2 1.2M4.53 11.47l-1.2 1.2M12.67 12.67l-1.2-1.2M4.53 4.53l-1.2-1.2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M13.5 9.4A5.8 5.8 0 0 1 6.6 2.5a5.8 5.8 0 1 0 6.9 6.9Z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
