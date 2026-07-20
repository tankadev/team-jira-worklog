'use server'

import { setDayOff } from '@/lib/days-off'
import type { DayOffKind } from '@/lib/quota'

export interface DayOffResult {
  ok: boolean
  message: string
}

const KINDS = ['full', 'morning', 'afternoon'] as const
const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Marks or clears leave for one day.
 *
 * Purely local: nothing is written to Jira, because this describes the person's
 * availability rather than anything about the work.
 */
export async function setDayOffAction(
  date: string,
  kind: DayOffKind | null,
): Promise<DayOffResult> {
  if (!ISO.test(date)) return { ok: false, message: 'Ngày không hợp lệ' }
  if (kind && !KINDS.includes(kind)) return { ok: false, message: 'Loại nghỉ không hợp lệ' }

  try {
    setDayOff(date, kind)
    return {
      ok: true,
      message: kind ? 'Đã đánh dấu ngày nghỉ' : 'Đã bỏ đánh dấu',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}
