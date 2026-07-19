import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Defaults to true, and caches fetch responses across hot reloads *including*
     * ones marked `cache: 'no-store'`. This is a live view over Jira, so a stale
     * read is a bug — and one that would only appear in dev, which makes it
     * doubly confusing to chase.
     */
    serverComponentsHmrCache: false,
  },
};

export default nextConfig;
