'use server'

import { revalidatePath } from 'next/cache'

import { isModuleEnabled } from '@/lib/modules/state'
import type { ProductConfig, ReleaseTaskShape, ReportExclude } from '@/lib/modules/releases/model'
import { setProducts, setReportExcludes, setTeams } from '@/lib/modules/releases/config'
import {
  deleteReleaseTask,
  patchReleaseTask,
  saveReleaseTask,
} from '@/lib/modules/releases/store'

export interface ReleaseResult {
  ok: boolean
  message: string
  id?: number
}

function enabled(): boolean {
  return isModuleEnabled('releases')
}

export async function saveReleaseTaskAction(
  input: ReleaseTaskShape & { id?: number },
): Promise<ReleaseResult> {
  if (!enabled()) return { ok: false, message: 'Module đang tắt' }
  if (!input.taskId.trim() && !input.description.trim()) {
    return { ok: false, message: 'Cần tiêu đề hoặc nội dung' }
  }
  if (!input.product) return { ok: false, message: 'Chọn product' }
  if (!input.environment) return { ok: false, message: 'Chọn môi trường' }

  try {
    const id = saveReleaseTask({
      id: input.id,
      taskId: input.taskId.trim(),
      description: input.description.trim(),
      branchName: input.branchName.trim(),
      subTasks: input.subTasks.map((s) => s.trim()).filter(Boolean),
      product: input.product,
      team: input.team,
      environment: input.environment,
      buildStatus: input.buildStatus,
      noBranch: input.noBranch,
      refId: input.noBranch ? input.refId : null,
    })
    revalidatePath('/m/releases')
    return { ok: true, message: 'Đã lưu task', id }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}

export async function patchReleaseTaskAction(
  id: number,
  patch: { environment?: string; buildStatus?: string },
): Promise<ReleaseResult> {
  if (!enabled()) return { ok: false, message: 'Module đang tắt' }
  try {
    patchReleaseTask(id, patch)
    revalidatePath('/m/releases')
    return { ok: true, message: 'Đã cập nhật' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không cập nhật được' }
  }
}

export async function deleteReleaseTaskAction(id: number): Promise<ReleaseResult> {
  if (!enabled()) return { ok: false, message: 'Module đang tắt' }
  try {
    deleteReleaseTask(id)
    revalidatePath('/m/releases')
    return { ok: true, message: 'Đã xoá task' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không xoá được' }
  }
}

export async function saveProductsAction(products: ProductConfig[]): Promise<ReleaseResult> {
  if (!enabled()) return { ok: false, message: 'Module đang tắt' }
  if (!products.some((p) => p.name.trim() && p.environments.some((e) => e.trim()))) {
    return { ok: false, message: 'Cần ít nhất 1 product có tên và môi trường' }
  }
  try {
    setProducts(products)
    revalidatePath('/m/releases')
    return { ok: true, message: 'Đã lưu products' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}

export async function saveTeamsAction(teams: string[]): Promise<ReleaseResult> {
  if (!enabled()) return { ok: false, message: 'Module đang tắt' }
  try {
    setTeams(teams)
    revalidatePath('/m/releases')
    return { ok: true, message: 'Đã lưu teams' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}

export async function saveReportExcludesAction(excludes: ReportExclude[]): Promise<ReleaseResult> {
  if (!enabled()) return { ok: false, message: 'Module đang tắt' }
  try {
    setReportExcludes(excludes)
    revalidatePath('/m/releases')
    return { ok: true, message: 'Đã lưu quy tắc ẩn team' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không lưu được' }
  }
}
