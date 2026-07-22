'use server'

import { revalidatePath } from 'next/cache'

import { getModule } from '@/lib/modules/registry'
import { setModuleEnabled } from '@/lib/modules/state'

export interface ModuleToggleResult {
  ok: boolean
  message: string
}

export async function toggleModuleAction(
  id: string,
  enabled: boolean,
): Promise<ModuleToggleResult> {
  const m = getModule(id)
  if (!m) return { ok: false, message: 'Module không tồn tại' }

  try {
    setModuleEnabled(m.id, enabled)
    // Nav lives in the root layout, so the whole tree must revalidate for the
    // module's link to appear or disappear.
    revalidatePath('/', 'layout')
    return { ok: true, message: enabled ? `Đã bật ${m.name}` : `Đã tắt ${m.name}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Không đổi được' }
  }
}
