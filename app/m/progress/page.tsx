import { connection } from 'next/server'

import { ModuleGate } from '@/lib/modules/gate'
import { getProgressReport } from '@/lib/modules/progress/store'
import { todayIn } from '@/lib/time'

import { ProgressEditor } from './editor'

export default async function ProgressPage() {
  await connection()
  const report = getProgressReport()

  return (
    <ModuleGate id="progress">
      <ProgressEditor initial={report} today={todayIn()} />
    </ModuleGate>
  )
}
