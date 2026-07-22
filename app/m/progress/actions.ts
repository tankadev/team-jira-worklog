'use server'

import { revalidatePath } from 'next/cache'

import { isModuleEnabled } from '@/lib/modules/state'
import { saveProgressReport, type SaveProgressInput } from '@/lib/modules/progress/store'

export interface ProgressResult {
  ok: boolean
  message: string
  id?: number
}

export async function saveProgressAction(input: SaveProgressInput): Promise<ProgressResult> {
  if (!isModuleEnabled('progress')) return { ok: false, message: 'Module đang tắt' }
  if (!input.member.trim()) return { ok: false, message: 'Chưa điền tên member' }
  if (!input.reportDate) return { ok: false, message: 'Chưa chọn ngày' }

  try {
    const id = saveProgressReport({
      id: input.id,
      member: input.member.trim(),
      reportDate: input.reportDate,
      // Drop rows the user started but never named — a blank feature is noise.
      items: input.items.filter((it) => it.feature.trim() || it.prefix.trim()),
    })
    revalidatePath('/m/progress')
    return { ok: true, message: 'Đã lưu tiến độ', id }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}
