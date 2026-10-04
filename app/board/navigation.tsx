"use client";

import { useRouter } from "next/navigation";

import { invalidateViewsAction } from "../refresh-actions";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
} from "react";

/**
 * Shared navigation state for the board.
 *
 * Filter and date changes re-render the page on the server, which takes a
 * visible moment against Jira. Without a shared pending flag each control only
 * knows about its own transition, so the rest of the page looks frozen with no
 * explanation. This puts one flag where every part of the board can read it.
 *
 * Two flags, not one. `pending` is a navigation — the page is turning into a
 * different one, so dimming it and locking the filters is honest. `refreshing`
 * is the re-fetch after a write: the page stays the same page, so it must stay
 * usable — the control that was edited shows its own spinner, and the rest of
 * the board only gets the thin bar at the top.
 */
const NavContext = createContext<{
  /** `quiet` re-renders without dimming — for a URL change that is really a refresh. */
  navigate: (href: string, opts?: { quiet?: boolean }) => void;
  /** Re-fetches the route in the background, leaving the page interactive. */
  refresh: () => void;
  pending: boolean;
  refreshing: boolean;
}>({
  navigate: () => {},
  refresh: () => {},
  pending: false,
  refreshing: false,
});

export function useNav() {
  return useContext(NavContext);
}

export function NavProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();

  // Memoised because consumers keep these: an interval keyed on `refresh`
  // identity was being torn down and restarted on every transition, so a
  // periodic refresh could never reach its own deadline.
  const navigate = useCallback(
    (href: string, opts?: { quiet?: boolean }) => {
      (opts?.quiet ? startRefresh : startTransition)(() => router.push(href));
    },
    [router],
  );

  /**
   * Used after a write. Kept apart from navigation so nothing dims: dimming the
   * whole board for the two or three seconds the refetch takes locked every
   * other row out over one edit. The progress bar still runs, so the side panels'
   * stale numbers read as "updating" rather than "the save did not work".
   */
  const refresh = useCallback(() => {
    startRefresh(async () => {
      // Every screen kept in the client cache, not just this one — otherwise
      // the report would still show the hours from before this log.
      await invalidateViewsAction();
      router.refresh();
    });
  }, [router]);

  const value = useMemo(
    () => ({ navigate, refresh, pending, refreshing }),
    [navigate, refresh, pending, refreshing],
  );

  return (
    <NavContext.Provider value={value}>
      {(pending || refreshing) && <TopProgress />}
      {children}
    </NavContext.Provider>
  );
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
  );
}

/**
 * Dims and freezes content while a navigation or refresh is in flight.
 *
 * `label` puts a word on top of the fade. Fading alone is ambiguous — after
 * logging hours, dimmed-but-unchanged numbers look the same as a failed save.
 */
export function NavDimmer({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const { pending } = useNav();
  return (
    <div className="relative">
      <div
        aria-busy={pending}
        className={
          "transition-opacity duration-150 " +
          (pending ? "pointer-events-none opacity-40" : "opacity-100")
        }
      >
        {children}
      </div>

      {pending && label && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-small text-ink-2 shadow-sm">
            <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

/** Inline "đang tải" chip for the filter bar — informational, never blocking. */
export function NavSpinner() {
  const { pending, refreshing } = useNav();
  if (!pending && !refreshing) return null;
  return (
    <span className="flex items-center gap-1.5 font-mono text-small text-ink-3">
      <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-accent" />
      đang tải…
    </span>
  );
}
