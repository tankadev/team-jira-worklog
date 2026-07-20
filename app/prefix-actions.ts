'use server'

import { revalidatePath } from 'next/cache'

import { listPrefixes, setPrefixes } from '@/lib/drafts'

export interface PrefixResult {
  ok: boolean
  message: string
  labels?: string[]
}

/** Accepts `QA` or `[QA]` and always stores the bracketed form. */
function normalise(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  return v.startsWith('[') && v.endsWith(']') ? v : `[${v.replace(/^\[|\]$/g, '')}]`
}

/**
 * Replaces the whole list in one call.
 *
 * Order matters — it is the order the chips appear in the composer — so the
 * client sends the full array rather than individual add/remove operations,
 * which would need a second call just to reorder.
 */
export async function savePrefixesAction(labels: string[]): Promise<PrefixResult> {
  const cleaned: string[] = []
  for (const raw of labels) {
    const label = normalise(raw)
    if (label && !cleaned.includes(label)) cleaned.push(label)
  }

  try {
    setPrefixes(cleaned)
    revalidatePath('/settings')
    revalidatePath('/new')
    return { ok: true, message: 'Đã lưu danh sách tiền tố', labels: cleaned }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}

export async function getPrefixesAction(): Promise<string[]> {
  return listPrefixes()
}
