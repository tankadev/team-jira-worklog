/* eslint-disable @next/next/no-img-element */

/**
 * Jira's own issue-type icon, served from `public/issue-types/`.
 *
 * The files were pulled from this instance's `createmeta` once and committed, so
 * the board renders without a round trip to Jira per badge. The trade-off is
 * that a newly added issue type has no icon until someone re-runs the download —
 * hence the explicit list, which renders nothing rather than a broken image.
 *
 * Re-download with:
 *   curl -su "$JIRA_EMAIL:$JIRA_API_TOKEN" \
 *     "$JIRA_BASE_URL/rest/api/3/issue/createmeta/VT/issuetypes?maxResults=50"
 */
const AVAILABLE = new Set([
  'story',
  'task',
  'bug',
  'epic',
  'subtask',
  'qc',
  'improve',
  'support',
])

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function TypeIcon({
  name,
  className = 'size-3.5',
}: {
  name: string
  className?: string
}) {
  const file = slug(name)
  if (!file || !AVAILABLE.has(file)) return null

  return (
    <img
      src={`/issue-types/${file}.svg`}
      alt=""
      aria-hidden
      className={'inline-block shrink-0 align-[-2px] ' + className}
    />
  )
}
