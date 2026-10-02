'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'

import { clearTransitionsCache } from '@/lib/transitions-cache'

import { refreshDataAction } from './refresh-actions'

import { Icon, LogoMark, type IconName } from './icons'

// Core stays fixed; Settings sits at the end. Enabled modules slot in between,
// under their own heading, via the `modules` prop the server layout supplies.
const CORE: Array<{ href: string; label: string; icon: IconName }> = [
  { href: '/', label: 'Task board', icon: 'kanban' },
  { href: '/find', label: 'Tìm & nhận task', icon: 'search-check' },
  { href: '/new', label: 'Task mới', icon: 'square-pen' },
  { href: '/report', label: 'Daily report', icon: 'clipboard-list' },
]

const MODULE_ICONS: Record<string, IconName> = {
  '/m/progress': 'chart-line',
  '/m/ios-publish': 'phone-upload',
  '/m/sdk-release': 'package',
  '/m/releases': 'rocket',
  '/m/code-review': 'pull-request',
}

export function Nav({
  context,
  modules = [],
}: {
  /** What the app is pointed at — shown so an empty list reads as "empty for VT". */
  context?: { project: string; board?: string; team?: string | null }
  modules?: Array<{ href: string; label: string }>
}) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <aside className="sticky top-0 z-30 flex flex-col gap-2 border-b border-line bg-surface/90 px-3 pt-3 backdrop-blur md:h-screen md:gap-4 md:border-b-0 md:border-r md:bg-surface md:px-3 md:pb-3 md:pt-4 md:backdrop-blur-none">
      <div className="flex items-center gap-2.5 px-1.5">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-gradient-to-br from-accent-2 to-accent text-on-accent shadow-card ring-1 ring-inset ring-white/15"
        >
          <LogoMark className="size-5" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <b className="block truncate text-emph font-semibold tracking-tight">Jira Logwork</b>
          {context ? (
            <span className="block truncate font-mono text-micro text-ink-3 md:hidden" title={contextTitle(context)}>
              {context.project}
              {context.board ? ` · #${context.board}` : ''}
            </span>
          ) : null}
          <span className="hidden truncate text-micro text-ink-3 md:block">Team worklog</span>
        </div>
        {/* Beside the brand on a phone; on a wide screen they move into the
            context strip below, where they no longer crowd the name. Never
            pinned to the bottom: on a long board that drifted out of reach. */}
        <span className="flex md:hidden">
          <RefreshButton />
          <ThemeToggle />
        </span>
      </div>

      {context && (
        <div className="hidden items-center gap-2.5 rounded-xl border border-line bg-surface-2/50 p-2 md:flex">
          <span
            aria-hidden
            className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft font-mono text-caption font-bold text-accent-ink"
          >
            {context.project.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1" title={contextTitle(context)}>
            <div className="truncate font-mono text-caption font-semibold text-ink">
              {context.project}
              {context.board && <span className="font-normal text-ink-3"> · #{context.board}</span>}
            </div>
            {context.team ? (
              <div className="flex items-center gap-1.5 text-micro text-ink-3">
                <span className="size-1.5 shrink-0 rounded-full bg-good" />
                <span className="truncate">
                  team <span className="font-mono text-ink-2">{context.team}</span>
                </span>
              </div>
            ) : (
              <div className="text-micro text-ink-3">toàn project</div>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <RefreshButton />
            <ThemeToggle />
          </div>
        </div>
      )}

      {/* A single scrolling row on a phone — wrapping four labels into a 390px
          bar broke "Tìm & nhận task" over four lines. On a wide screen the
          list scrolls on its own so Settings stays pinned at the bottom. */}
      <nav className="-mx-3 flex flex-row gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] md:min-h-0 md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:pb-0">
        <SectionLabel>Làm việc</SectionLabel>
        {CORE.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}

        {modules.length > 0 && (
          <>
            <SectionLabel className="md:mt-5">Modules</SectionLabel>
            {modules.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={MODULE_ICONS[item.href] ?? 'puzzle'}
                active={isActive(item.href)}
              />
            ))}
          </>
        )}

        {/* Inline with the rest on a phone; below the scrolling list on a wide screen. */}
        <span className="contents md:hidden">
          <NavLink href="/settings" label="Settings" icon="settings" active={isActive('/settings')} />
        </span>
      </nav>

      <div className="hidden border-t border-line pt-3 md:block">
        <NavLink href="/settings" label="Settings" icon="settings" active={isActive('/settings')} />
      </div>
    </aside>
  )
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={
        'mb-1.5 hidden px-2.5 text-[10.5px] font-semibold uppercase leading-[13px] tracking-[0.08em] text-ink-3 md:block ' +
        className
      }
    >
      {children}
    </div>
  )
}

function contextTitle(c: { project: string; board?: string; team?: string | null }) {
  return [`Project ${c.project}`, c.board && `board ${c.board}`, c.team && `team ${c.team}`]
    .filter(Boolean)
    .join(' · ')
}

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string
  label: string
  icon: IconName
  active: boolean
}) {
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
        'group relative flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-[7px] text-body transition-colors md:py-2 ' +
        (active
          ? 'bg-accent-soft font-semibold text-accent-ink'
          : 'text-ink-2 hover:bg-surface-2 hover:text-ink')
      }
    >
      {/* The marker on the left edge — only in the column; a phone's row of pills has no edge to hang it on. */}
      {active && (
        <span
          aria-hidden
          className="absolute -left-3 top-1.5 bottom-1.5 hidden w-[3px] rounded-r-full bg-accent md:block"
        />
      )}
      <Icon
        name={icon}
        className={
          'size-[17px] shrink-0 transition-colors ' +
          (active ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2')
        }
      />
      <span className="flex-1 truncate">{label}</span>
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

/** Drops every cache (server reads, client pages, status transitions) and re-renders — the "give me live data now" button. */
function RefreshButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function refresh() {
    // Everything cached anywhere goes: the server's Jira reads, every page in
    // the client cache, and the remembered status transitions.
    clearTransitionsCache()
    startTransition(async () => {
      await refreshDataAction()
      router.refresh()
    })
  }

  return (
    <button
      onClick={refresh}
      disabled={pending}
      title="Đồng bộ lại từ Jira — các màn hình được giữ trong bộ nhớ cho tới khi bấm nút này"
      aria-label="Đồng bộ lại từ Jira"
      className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-60"
    >
      <Icon name="refresh" className={'size-4 ' + (pending ? 'animate-spin' : '')} />
    </button>
  )
}

/**
 * Writes data-theme on <html>, which the CSS treats as the highest-priority
 * override so it wins over prefers-color-scheme in both directions.
 *
 * Both glyphs are rendered every time and CSS hides one (.theme-icon-*). The
 * active theme can come from the OS, which the server has no way of knowing, so
 * choosing here — in JS, during render — produced markup that disagreed with
 * the server's on every load under a dark OS, and React reported it as a
 * hydration failure.
 */
function ThemeToggle() {
  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored
  }, [])

  function toggle() {
    const current =
      document.documentElement.dataset.theme ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    const next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    localStorage.setItem('theme', next)
  }

  return (
    <button
      onClick={toggle}
      title="Đổi nền sáng / tối"
      aria-label="Đổi nền sáng / tối"
      className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-surface-2 hover:text-ink"
    >
      {/* sun — shown while the dark theme is on, i.e. "go light" */}
      <Icon name="sun" className="theme-icon-dark size-4" />
      {/* moon — shown while the light theme is on, i.e. "go dark" */}
      <Icon name="moon" className="theme-icon-light size-4" />
    </button>
  )
}
