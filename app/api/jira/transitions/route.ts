import { getTransitions } from '@/lib/jira/issues'

export const runtime = 'nodejs'

/**
 * Transitions for one issue, fetched only when the user opens a status menu.
 *
 * Loading these up front would cost one request per row — twenty subtasks would
 * mean twenty round trips before the board could render. They are also
 * per-issue and per-workflow, so they cannot be shared or cached across rows.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) return Response.json({ error: 'Thiếu tham số key' }, { status: 400 })

  try {
    return Response.json({ transitions: await getTransitions(key) })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không lấy được transition' },
      { status: 500 },
    )
  }
}
