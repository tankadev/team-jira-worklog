import { getIssueDetail } from '@/lib/jira/issues'

export const runtime = 'nodejs'

/**
 * Detail for one issue, fetched when its key is clicked.
 *
 * On demand rather than with the board: the description is the largest field on
 * an issue and is read one row at a time, so loading it for every row would cost
 * far more than it saves.
 */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get('key')
  if (!key) return Response.json({ error: 'Thiếu tham số key' }, { status: 400 })

  try {
    return Response.json(await getIssueDetail(key))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không lấy được chi tiết' },
      { status: 500 },
    )
  }
}
