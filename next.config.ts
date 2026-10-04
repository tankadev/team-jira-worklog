import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Only the Docker build asks for this: it emits `.next/standalone`, a
   * self-contained server with just the node_modules it traces, which keeps the
   * image small. Local `npm run build && npm start` stays as it was.
   */
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  /** Bottom-left is where Settings sits, pinned at the foot of the sidebar. */
  devIndicators: {
    position: 'bottom-right',
  },
  experimental: {
    /**
     * Defaults to true, and caches fetch responses across hot reloads *including*
     * ones marked `cache: 'no-store'`. This is a live view over Jira, so a stale
     * read is a bug — and one that would only appear in dev, which makes it
     * doubly confusing to chase.
     */
    serverComponentsHmrCache: false,
    /**
     * Keeps visited pages in the browser's client cache, so switching between
     * menus reuses what was already loaded instead of asking Jira again.
     *
     * Freshness is explicit instead: the "Làm mới" button and every write the
     * app makes (log, status, points, dates, create) invalidate the whole
     * client cache through `revalidatePath`, so a page is only ever as old as
     * the last change made from here — and one click from current.
     */
    staleTimes: {
      dynamic: 3600,
      static: 3600,
    },
  },
};

export default nextConfig;
