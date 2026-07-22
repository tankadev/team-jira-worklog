import { connection } from 'next/server'

import { ModuleGate } from '@/lib/modules/gate'
import { getReleasesConfig } from '@/lib/modules/releases/config'
import { listReleaseTasks } from '@/lib/modules/releases/store'

import { ReleaseBoard } from './board'

export default async function ReleasesPage() {
  await connection()
  const tasks = listReleaseTasks()
  const { products, teams } = getReleasesConfig()

  return (
    <ModuleGate id="releases">
      <ReleaseBoard initial={tasks} products={products} teams={teams} />
    </ModuleGate>
  )
}
