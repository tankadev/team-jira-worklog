'use server'

import { revalidatePath } from 'next/cache'

import { getMyself } from '@/lib/jira/client'
import { assignToMe, deletePreset, savePreset } from '@/lib/jira/find'

export interface FindResult {
  ok: boolean
  message: string
}

export async function assignToMeAction(issueKey: string): Promise<FindResult> {
  try {
    const me = await getMyself()
    await assignToMe(issueKey, me.accountId)
    revalidatePath('/find')
    revalidatePath('/')
    return { ok: true, message: `${issueKey} đã giao cho bạn` }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Không nhận được task',
    }
  }
}

export async function savePresetAction(name: string, jql: string): Promise<FindResult> {
  if (!name.trim()) return { ok: false, message: 'Preset cần có tên' }
  if (!jql.trim()) return { ok: false, message: 'JQL đang trống' }
  try {
    savePreset(name.trim(), jql.trim())
    revalidatePath('/find')
    return { ok: true, message: `Đã lưu preset "${name.trim()}"` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}

export async function deletePresetAction(id: number): Promise<FindResult> {
  try {
    deletePreset(id)
    revalidatePath('/find')
    return { ok: true, message: 'Đã xoá preset' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không xoá được' }
  }
}
