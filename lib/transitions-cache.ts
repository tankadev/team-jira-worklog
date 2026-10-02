/**
 * Remembers the transitions a status offers, so the status menu opens at once.
 *
 * What a status can move to is decided by the workflow, which changes rarely —
 * this project runs one workflow for every issue type. So the list is keyed by
 * issue type and status rather than by issue: asking once for "To Do" on a
 * Sub-task answers every Sub-task in To Do on the board. Kept in memory and in
 * localStorage for a week; the "Làm mới" button clears it, and a transition
 * that Jira rejects drops its entry so the next open asks again.
 *
 * Client only.
 */
import type { Transition } from './jira/types'

const STORAGE_KEY = 'jira-transitions-v1'
const TTL_MS = 7 * 24 * 3600 * 1000

type Entry = { at: number; items: Transition[] }

let memory: Map<string, Entry> | null = null
const inflight = new Map<string, Promise<Transition[]>>()

function store(): Map<string, Entry> {
  if (memory) return memory
  memory = new Map()
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Entry>
    for (const [k, v] of Object.entries(raw)) {
      if (v && Array.isArray(v.items) && Date.now() - v.at < TTL_MS) memory.set(k, v)
    }
  } catch {
    // Private mode, blocked storage, bad JSON — memory alone still works.
  }
  return memory
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(store())))
  } catch {
    // Same as above: best effort.
  }
}

export function transitionsKey(statusName: string, issueType?: string | null) {
  return `${(issueType ?? '*').toLowerCase()}|${statusName.trim().toLowerCase()}`
}

export function cachedTransitions(key: string): Transition[] | null {
  const hit = store().get(key)
  if (!hit) return null
  if (Date.now() - hit.at > TTL_MS) {
    store().delete(key)
    return null
  }
  return hit.items
}

/**
 * The cached list, or one fetch for it — shared, so hovering and clicking the
 * same pill (or two pills in the same status) cost a single request.
 */
export function loadTransitions(issueKey: string, key: string): Promise<Transition[]> {
  const hit = cachedTransitions(key)
  if (hit) return Promise.resolve(hit)
  const running = inflight.get(key)
  if (running) return running

  const run = fetch(`/api/jira/transitions?key=${encodeURIComponent(issueKey)}`)
    .then(async (res) => {
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Không lấy được transition')
      const items = (body.transitions ?? []) as Transition[]
      store().set(key, { at: Date.now(), items })
      persist()
      return items
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, run)
  return run
}

export function forgetTransitions(key: string) {
  store().delete(key)
  persist()
}

export function clearTransitionsCache() {
  store().clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
