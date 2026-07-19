'use client'

import { useRouter } from 'next/navigation'
import { createContext, useContext, useTransition } from 'react'

/**
 * Shared navigation state for the board.
 *
 * Filter and date changes re-render the page on the server, which takes a
 * visible moment against Jira. Without a shared pending flag each control only
 * knows about its own transition, so the rest of the page looks frozen with no
 * explanation. This puts one flag where every part of the board can read it.
 */
const NavContext = createContext<{ navigate: (href: string) => void; pending: boolean }>({
  navigate: () => {},
  pending: false,
})

export function useNav() {
  return useContext(NavContext)
}

export function NavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function navigate(href: string) {
    startTransition(() => router.push(href))
  }

  return (
    <NavContext.Provider value={{ navigate, pending }}>
      {pending && <TopProgress />}
      {children}
    </NavContext.Provider>
  )
}

/** Indeterminate bar pinned to the top — the request length is unknown. */
function TopProgress() {
  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-accent-soft">
        <div className="h-full w-1/3 animate-[nav-slide_1.1s_ease-in-out_infinite] bg-accent" />
      </div>
      <style>{`
        @keyframes nav-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[nav-slide_1\\.1s_ease-in-out_infinite\\] {
            animation: none;
            width: 100%;
            opacity: 0.6;
          }
        }
      `}</style>
    </>
  )
}

/** Dims and freezes content while a navigation is in flight. */
export function NavDimmer({ children }: { children: React.ReactNode }) {
  const { pending } = useNav()
  return (
    <div
      aria-busy={pending}
      className={
        'transition-opacity duration-150 ' +
        (pending ? 'pointer-events-none opacity-45' : 'opacity-100')
      }
    >
      {children}
    </div>
  )
}

/** Inline "đang tải" chip for the filter bar. */
export function NavSpinner() {
  const { pending } = useNav()
  if (!pending) return null
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-ink-3">
      <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
      đang tải…
    </span>
  )
}
