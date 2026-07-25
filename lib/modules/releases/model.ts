/**
 * Types, defaults and report rendering for the releases board — pure, no
 * `server-only`, so the client board and the server share them. Products and
 * teams are user config (see config.ts); the values here are only the seed a
 * fresh install starts from. Ported from the task-tracking tool.
 */

/** A tracked repo/project and the environments its builds move through. */
export interface ProductConfig {
  id: string
  name: string
  /** Ordered low → high; also the left → right column order on the board. */
  environments: string[]
  /** Include this product's tasks in the generated report. */
  inReport: boolean
}

/** Progress of a task's build, low → high. */
export const BUILD_STATUS = ['đang PR', 'đã merge', 'đã build', 'đã public'] as const

/** "Hide team X at environment Y" in the report (e.g. CXP not shown at Develop). */
export interface ReportExclude {
  environment: string
  team: string
}

export const DEFAULT_PRODUCTS: ProductConfig[] = [
  { id: 'lite', name: 'Lite', environments: ['CTalk Dev', 'Integration', 'Staging', 'Released'], inReport: true },
  { id: 'matrix', name: 'MatrixRustSDK', environments: ['CTalk Dev', 'Integration', 'Staging', 'Released'], inReport: true },
  { id: 'classic', name: 'Classic', environments: ['Dev', 'Staging', 'Released'], inReport: true },
]

export const DEFAULT_TEAMS = ['CTalk', 'Hir', 'CXP']

export interface ReleaseTaskShape {
  taskId: string
  description: string
  branchName: string
  subTasks: string[]
  product: string
  team: string
  environment: string
  buildStatus: string
  /** No code branch of its own (e.g. Lite just rebuilds against a new SDK). */
  noBranch: boolean
  /** Another task this one derives from (e.g. the MatrixRustSDK task). */
  refId: number | null
}

interface ReportTask {
  taskId: string
  description: string
  team: string
  environment: string
  buildStatus: string
}

export interface ReportProduct {
  name: string
  /** This product's own environments, low → high. */
  environments: string[]
  tasks: ReportTask[]
}

/** Only fully-shipped tasks reach the report — the last build stage. */
export const REPORTED_STATUS = BUILD_STATUS[BUILD_STATUS.length - 1]

/** The stage where a build exists and is ready to hand to testers. */
export const BUILT_STATUS = BUILD_STATUS[2] // 'đã build'

/** The task fields the "What to Test" seed needs. */
export interface BuiltTaskLike {
  team: string
  taskId: string
  description: string
  product: string
  environment: string
  buildStatus: string
}

/**
 * Groups tasks by team as TestFlight-ready lines:
 *
 *   - Hir: VTL-456, VTL-555
 *   - CTalk: VTL-222
 *
 * Uses the task id, falling back to the description when a task has no id. Teams
 * appear in first-seen order.
 */
function groupByTeam(tasks: BuiltTaskLike[]): string {
  const teams = [...new Set(tasks.map((t) => t.team).filter(Boolean))]
  return teams
    .map((team) => {
      const ids = tasks
        .filter((t) => t.team === team)
        .map((t) => t.taskId.trim() || t.description.trim())
        .filter(Boolean)
        .join(', ')
      return ids ? `- ${team}: ${ids}` : null
    })
    .filter(Boolean)
    .join('\n')
}

/** Every "đã build" task grouped by team — the unscoped seed. */
export function renderBuiltTasksByTeam(tasks: BuiltTaskLike[]): string {
  return groupByTeam(tasks.filter((t) => t.buildStatus === BUILT_STATUS))
}

/**
 * "What to Test" seed for one iOS app, scoped to the product and environment the
 * app is mapped to. A build at a given environment carries every "đã build" task
 * of that product that has reached that environment or higher — the same
 * "in or above" rule the status report uses — grouped by team.
 *
 * With no environment mapping (or one the product no longer lists), the env
 * filter is dropped and all of the product's built tasks are used.
 */
export function renderBuiltForApp(
  tasks: BuiltTaskLike[],
  productName: string,
  environment: string,
  environments: string[],
): string {
  const rankHere = environments.indexOf(environment)
  const active = tasks.filter(
    (t) =>
      t.product === productName &&
      t.buildStatus === BUILT_STATUS &&
      (rankHere < 0 || environments.indexOf(t.environment) >= rankHere),
  )
  return groupByTeam(active)
}

/**
 * Copy-ready status report, in the shape the original task-tracking tool used:
 *
 *   🚀 Tính năng đã deploy lên môi trường Staging:
 *   *Lite:
 *          - CTalk: KAN-1
 *   *MatrixRustSDK:
 *          - Hir: SDK-9
 *
 * Only tasks whose build status is "đã public" are reported. One section per
 * environment — products sharing an environment merge under it, each as its own
 * *Product block. A task that reached a higher env is also listed under the
 * lower ones ("in or above"), ranked within its own product.
 */
export function renderReleaseReport(
  products: ReportProduct[],
  excludes: ReportExclude[] = [],
): string {
  const isHidden = (environment: string, team: string) =>
    excludes.some((e) => e.environment === environment && e.team === team)

  // Section order: every environment, in first-appearance order.
  const sections: string[] = []
  for (const p of products) {
    for (const env of p.environments) {
      if (!sections.includes(env)) sections.push(env)
    }
  }

  const text = sections
    .map((env) => {
      const title = `🚀 Tính năng đã deploy lên môi trường ${env}:`
      const blocks = products
        .map((p) => {
          const rankHere = p.environments.indexOf(env)
          if (rankHere < 0) return null // product has no such environment
          const active = p.tasks.filter(
            (t) =>
              t.buildStatus === REPORTED_STATUS &&
              p.environments.indexOf(t.environment) >= rankHere,
          )
          const teams = [...new Set(active.map((t) => t.team).filter(Boolean))]
          const lines = teams
            .map((team) => {
              if (isHidden(env, team)) return null // team hidden at this environment
              const ids = active
                .filter((t) => t.team === team)
                .map((t) => t.taskId.trim() || t.description.trim())
                .filter(Boolean)
                .join(', ')
              return ids ? `       - ${team}: ${ids}` : null
            })
            .filter(Boolean)
          return lines.length ? `*${p.name}:\n${lines.join('\n')}` : null
        })
        .filter(Boolean)
      return blocks.length ? `${title}\n${blocks.join('\n')}` : `${title}\nNo active tasks`
    })
    .join('\n\n')

  return text || '(chưa có task để report)'
}
