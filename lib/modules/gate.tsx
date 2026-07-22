import Link from 'next/link'

import { getModule, type ModuleId } from './registry'
import { isModuleEnabled } from './state'

/**
 * Wraps a module's page. When the module is off it renders an activation prompt
 * instead of the page, so a stale link or a typed URL lands somewhere useful
 * rather than showing a feature the user has not turned on.
 *
 * The caller must `await connection()` first — the enabled check is a synchronous
 * SQLite read and must not resolve during prerender.
 */
export function ModuleGate({ id, children }: { id: ModuleId; children: React.ReactNode }) {
  if (isModuleEnabled(id)) return <>{children}</>

  const m = getModule(id)
  return (
    <div className="rounded-[9px] border border-line bg-surface p-[17px]">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
        Module chưa bật
      </div>
      <h1 className="mt-1 text-xl font-semibold tracking-tight">{m?.name ?? id}</h1>
      {m?.description && <p className="mt-2 max-w-prose text-[13px] text-ink-2">{m.description}</p>}
      <Link
        href="/settings#modules"
        className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent-2"
      >
        Kích hoạt trong Settings
      </Link>
    </div>
  )
}

/** Placeholder body for a registered-but-not-built module. */
export function ModuleWip({ id }: { id: ModuleId }) {
  const m = getModule(id)
  return (
    <>
      <header className="mb-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.09em] text-ink-3">
          Module · đang phát triển
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {m?.icon} {m?.name}
        </h1>
      </header>
      <div className="rounded-[9px] border border-dashed border-line-strong bg-surface p-[17px] text-[13px] text-ink-2">
        <p className="max-w-prose leading-relaxed">{m?.description}</p>
        <p className="mt-3 text-ink-3">
          Khung module đã sẵn sàng — phần này sẽ được dựng ở bước tiếp theo.
        </p>
      </div>
    </>
  )
}
