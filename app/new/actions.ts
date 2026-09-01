'use server'

import { revalidatePath } from 'next/cache'

import { type GenerateOutcome, generateTask, pointRulesText } from '@/lib/ai/gemini'
import { createIssue } from '@/lib/jira/create'
import { getProjectMeta } from '@/lib/jira/meta'
import { deleteDraft, saveDraft } from '@/lib/drafts'
import { SETTING_KEYS, getSetting } from '@/lib/settings'
import { withoutSprintPrefix } from '@/lib/sprint-name'
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
      message: [
        'Đã sinh nội dung',
        data.attempts > 1 ? `sau ${data.attempts} lần thử` : '',
        `· ${data.model}`,
      ]
        .filter(Boolean)
        .join(' '),
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
  /** Numeric issue id — needed to force Jira's search index to include it. */
  id?: string
  /**
   * Set when the issue was created but something after it was not — today only
   * the story point estimate. `ok` stays true: the issue is real, and treating
   * this as a failure would invite a duplicate create.
   */
  warning?: string
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
  /** YYYY-MM-DD. Empty means the field was left blank in the form. */
  startDate?: string
  dueDate?: string
}): Promise<CreateResult> {
  if (!input.summary.trim()) return { ok: false, message: 'Title đang trống' }
  if (!input.issueTypeId) return { ok: false, message: 'Chưa chọn issue type' }

  // The team requires both on every issue it files, so this is a create-time
  // rule rather than something to clean up on the board afterwards — but only
  // where the project actually carries the fields. Demanding a date Jira would
  // reject anyway would block creates on projects that never had them.
  const meta = await getProjectMeta()
  if (meta.startDateFieldId && !input.startDate) {
    return { ok: false, message: 'Cần chọn start date' }
  }
  if (meta.dueDateOnScreen && !input.dueDate) {
    return { ok: false, message: 'Cần chọn due date' }
  }
  if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
    return { ok: false, message: 'Due date không được sớm hơn start date' }
  }

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
      startDate: input.startDate,
      dueDate: input.dueDate,
    })

    // The draft has become a real issue, so drop the local copy — Jira is the
    // source of truth from here.
    if (input.draftId) deleteDraft(input.draftId)
    if (input.templateId) markTemplateUsed(input.templateId)

    revalidatePath('/')
    revalidatePath('/new')
    return {
      ok: true,
      message: `Đã tạo ${created.key}`,
      key: created.key,
      url: created.url,
      id: created.id,
      warning: created.storyPointsPending
        ? `${created.key} tạo xong nhưng chưa ghi được story point — bấm ô point trên board để đặt lại`
        : undefined,
    }
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
  startDate?: string | null
  dueDate?: string | null
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
    // Matched against the configured pattern so `[SPT-69]` is caught too.
    const pattern = getSetting(SETTING_KEYS.sprintPrefixPattern) ?? '[spt {n}]'
    const prefixes = withoutSprintPrefix(input.prefixes, pattern)
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
