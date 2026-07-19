'use server'

import { revalidatePath } from 'next/cache'

import { type GenerateOutcome, generateTask, pointRulesText } from '@/lib/ai/gemini'
import { createIssue } from '@/lib/jira/create'
import { deleteDraft, saveDraft, setPrefixes } from '@/lib/drafts'
import {
  deleteTaskTemplate,
  markTemplateUsed,
  saveTaskTemplate,
} from '@/lib/task-templates'

export interface GenerateResult {
  ok: boolean
  message: string
  data?: GenerateOutcome
}

export async function generateAction(
  idea: string,
  parentSummary?: string,
): Promise<GenerateResult> {
  if (!idea.trim()) return { ok: false, message: 'Chưa mô tả việc cần làm' }
  try {
    const data = await generateTask(idea, { pointRules: pointRulesText(), parentSummary })
    return {
      ok: true,
      // Worth surfacing: it tells the user the free tier is throttling them
      // rather than leaving them to wonder why it took several seconds.
      message:
        data.attempts > 1 ? `Đã sinh nội dung sau ${data.attempts} lần thử` : 'Đã sinh nội dung',
      data,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Gemini lỗi' }
  }
}

export interface CreateResult {
  ok: boolean
  message: string
  key?: string
  url?: string
}

/**
 * Creates the issue on Jira. This is the only write in the composer, and it
 * only ever runs from an explicit click — never as a side effect of generating
 * or saving a draft.
 */
export async function createIssueAction(input: {
  draftId?: number
  templateId?: number
  issueTypeId: string
  summary: string
  description: string
  dod: string
  parentKey?: string | null
  sprintId?: number | null
  storyPoints?: number | null
  assignToMe: boolean
}): Promise<CreateResult> {
  if (!input.summary.trim()) return { ok: false, message: 'Title đang trống' }
  if (!input.issueTypeId) return { ok: false, message: 'Chưa chọn issue type' }

  try {
    const created = await createIssue({
      issueTypeId: input.issueTypeId,
      summary: input.summary.trim(),
      description: input.description,
      dod: input.dod,
      parentKey: input.parentKey,
      sprintId: input.sprintId,
      storyPoints: input.storyPoints,
      assignToMe: input.assignToMe,
    })

    // The draft has become a real issue, so drop the local copy — Jira is the
    // source of truth from here.
    if (input.draftId) deleteDraft(input.draftId)
    if (input.templateId) markTemplateUsed(input.templateId)

    revalidatePath('/')
    revalidatePath('/new')
    return { ok: true, message: `Đã tạo ${created.key}`, key: created.key, url: created.url }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không tạo được issue' }
  }
}

export interface DraftResult {
  ok: boolean
  message: string
  id?: number
}

export async function saveDraftAction(input: {
  id?: number
  idea: string
  title: string
  description: string
  dod: string
  prefixes: string[]
  issueTypeId?: string | null
  parentKey?: string | null
  sprintId?: number | null
  storyPoints?: number | null
}): Promise<DraftResult> {
  try {
    const row = saveDraft(input)
    revalidatePath('/new')
    return { ok: true, message: 'Đã lưu draft', id: row.id }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được draft' }
  }
}

export async function deleteDraftAction(id: number): Promise<DraftResult> {
  try {
    deleteDraft(id)
    revalidatePath('/new')
    return { ok: true, message: 'Đã xoá draft' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không xoá được' }
  }
}

export async function savePrefixesAction(labels: string[]): Promise<DraftResult> {
  try {
    setPrefixes(labels)
    revalidatePath('/new')
    revalidatePath('/settings')
    return { ok: true, message: 'Đã lưu danh sách tiền tố' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}


export interface TemplateResult {
  ok: boolean
  message: string
  id?: number
}

export async function saveTaskTemplateAction(input: {
  id?: number
  name: string
  title: string
  description: string
  dod: string
  prefixes: string[]
  issueTypeId?: string | null
  storyPoints?: number | null
}): Promise<TemplateResult> {
  if (!input.name.trim()) return { ok: false, message: 'Mẫu cần có tên' }
  if (!input.title.trim()) return { ok: false, message: 'Mẫu cần có title' }

  try {
    // The sprint prefix is stripped before saving: it belongs to whichever
    // sprint is current when the template is used, not the one it was saved in.
    const prefixes = input.prefixes.filter((p) => !/^\[spt\s/i.test(p))
    const row = saveTaskTemplate({ ...input, name: input.name.trim(), prefixes })
    revalidatePath('/new')
    return { ok: true, message: `Đã lưu mẫu "${row.name}"`, id: row.id }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được mẫu' }
  }
}

export async function deleteTaskTemplateAction(id: number): Promise<TemplateResult> {
  try {
    deleteTaskTemplate(id)
    revalidatePath('/new')
    return { ok: true, message: 'Đã xoá mẫu' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không xoá được mẫu' }
  }
}
