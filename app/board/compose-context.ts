'use client'

import { useCallback, useRef, useState } from 'react'

import { sprintPrefix } from '@/lib/sprint-name'
import { composeSubtaskTitle, subtaskFromParent } from '@/lib/subtask-from-parent'

/** The slice of /api/compose the board's quick-create paths read. */
export interface ComposeContext {
  issueTypeId: string | null
  parentSprintEnd: string | null
  team: { label: string | null; prefix: string | null }
  supports: { startDate: boolean; dueDate: boolean }
  prefixes: string[]
  sprintPrefixPattern: string
  parent: {
    summary: string
    sprintName: string | null
    dueDate: string | null
    storyPoints: number | null
    description: string
    dod: string
  }
}

/**
 * Loads a parent's create context once, on first use rather than on render —
 * every parent on the board carries one of these, and most are never used.
 */
export function useComposeContext(parentKey: string) {
  const [ctx, setCtx] = useState<ComposeContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inflight = useRef<Promise<ComposeContext> | null>(null)

  const load = useCallback((): Promise<ComposeContext> => {
    if (ctx) return Promise.resolve(ctx)
    if (inflight.current) return inflight.current
    const run = fetch(`/api/compose?parent=${encodeURIComponent(parentKey)}&mode=subtask`)
      .then(async (r) => {
        const body = await r.json()
        if (!r.ok) throw new Error(body?.error ?? 'Không tải được dữ liệu')
        return body as ComposeContext
      })
      .then((c) => {
        setCtx(c)
        setError(null)
        return c
      })
    run.catch((e) => {
      setError(e instanceof Error ? e.message : String(e))
      inflight.current = null
    })
    inflight.current = run
    return run
  }, [ctx, parentKey])

  return { ctx, error, load }
}

/** What "copy the parent" produces for a context: the words, chips, and the finished title. */
export function suggestionFrom(c: ComposeContext) {
  const parts = subtaskFromParent(c.parent.summary, {
    prefixes: c.prefixes,
    teamPrefix: c.team.prefix,
    sprintPattern: c.sprintPrefixPattern,
  })
  const sprintCode = sprintPrefix(c.parent.sprintName, c.sprintPrefixPattern)
  return {
    ...parts,
    sprintCode,
    summary: composeSubtaskTitle([c.team.prefix, sprintCode, ...parts.picked], parts.title),
  }
}
