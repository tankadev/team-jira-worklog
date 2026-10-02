import { calendarMonth } from '@/lib/worklog-calendar'

export const runtime = 'nodejs'

/**
 * One month for the worklog calendar: day totals against quota, and the
 * worklogs of `key` when given. Read-only.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const month = url.searchParams.get('month') ?? ''
  const key = url.searchParams.get('key')
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: 'Tháng không hợp lệ' }, { status: 400 })

  try {
    return Response.json(await calendarMonth(month, key))
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Không tải được lịch' },
      { status: 500 },
    )
  }
}
