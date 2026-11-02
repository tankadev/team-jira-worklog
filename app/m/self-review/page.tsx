import Link from 'next/link'
import { connection } from 'next/server'

import { jiraBlockedBy, readCreds } from '@/lib/jira/client'
import { ModuleGate } from '@/lib/modules/gate'
import { loadSelfReview } from '@/lib/modules/self-review/jira'
import { COUNT_OPTIONS, DEFAULT_COUNT } from '@/lib/modules/self-review/model'
import { isModuleEnabled } from '@/lib/modules/state'

import { JiraDown } from '../../jira-down'
import { Review } from './review'

const HREF = '/m/self-review'

/**
 * Read entirely from Jira, so a dropped VPN has nothing to show — the same
 * single boundary the board and the other Jira-backed modules use.
 */
export default async function SelfReviewPage(props: PageProps<'/m/self-review'>) {
  await connection()
  if (!isModuleEnabled('self-review')) return <ModuleGate id="self-review">{null}</ModuleGate>
  try {
    return await page(props)
  } catch (error) {
    if (!jiraBlockedBy(error)) throw error
    return <JiraDown error={error} retryHref={HREF} />
  }
}

async function page(props: PageProps<'/m/self-review'>) {
  if (!readCreds()) {
    return (
      <div className="card p-5">
        <span className="text-body">Chưa cấu hình Jira — </span>
        <Link href="/settings" className="text-body text-accent-ink underline underline-offset-2">
          mở Settings
        </Link>
      </div>
    )
  }

  const sp = await props.searchParams
  const raw = Number(Array.isArray(sp.n) ? sp.n[0] : sp.n)
  const count = (COUNT_OPTIONS as readonly number[]).includes(raw) ? raw : DEFAULT_COUNT

  const reviews = await loadSelfReview(count)
  return <Review reviews={reviews} count={count} />
}
