'use server'

import { revalidatePath } from 'next/cache'

import { deleteTemplate, saveTemplate, setDefaultTemplate } from '@/lib/templates'

export interface TemplateResult {
  ok: boolean
  message: string
}

export async function saveTemplateAction(input: {
  id?: number
  name: string
  body: string
}): Promise<TemplateResult> {
  if (!input.name.trim()) return { ok: false, message: 'Template cần có tên' }
  if (!input.body.trim()) return { ok: false, message: 'Nội dung template đang trống' }

  try {
    saveTemplate({ id: input.id, name: input.name.trim(), body: input.body })
    revalidatePath('/settings')
    revalidatePath('/report')
    return { ok: true, message: 'Đã lưu template' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}

export async function deleteTemplateAction(id: number): Promise<TemplateResult> {
  try {
    deleteTemplate(id)
    revalidatePath('/settings')
    revalidatePath('/report')
    return { ok: true, message: 'Đã xoá template' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không xoá được' }
  }
}

export async function setDefaultTemplateAction(id: number): Promise<TemplateResult> {
  try {
    setDefaultTemplate(id)
    revalidatePath('/settings')
    revalidatePath('/report')
    return { ok: true, message: 'Đã đặt làm mặc định' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không đổi được' }
  }
}
