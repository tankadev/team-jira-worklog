/**
 * Where a finding may sit on a GitHub diff (anchorInDiff).
 *
 * Run: npx tsx tests/code-review-anchor.mts
 *
 * GitHub refuses ("could not be resolved") a comment whose lines are not all
 * inside one hunk — the bug a finding at 121–135 hit against a 120–133 hunk.
 */
import { anchorInDiff, ghPrNumber, postedHere } from '@/lib/modules/code-review/model'

let n = 0
let bad = 0
const eq = (a: unknown, b: unknown, m: string) => {
  n++
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    bad++
    console.log('FAIL', m, '\n  got: ', JSON.stringify(a), '\n  want:', JSON.stringify(b))
  }
}
const H: Array<[number, number]> = [[120, 133], [308, 318], [352, 374]]

eq(anchorInDiff(H, 121, 135), { line: 133, startLine: 121 }, 'range past the hunk end is trimmed (the reported bug)')
eq(anchorInDiff(H, 125, 130), { line: 130, startLine: 125 }, 'range inside a hunk is kept')
eq(anchorInDiff(H, 125, null), { line: 125 }, 'single line inside')
eq(anchorInDiff(H, 115, 122), { line: 122, startLine: 120 }, 'range starting before the hunk is trimmed at the start')
eq(anchorInDiff(H, 200, 210), null, 'nothing in the diff → not inline')
eq(anchorInDiff(H, 130, 310), { line: 133, startLine: 130 }, 'range across two hunks keeps the larger overlap')
eq(anchorInDiff(H, 133, 133), { line: 133 }, 'last line of a hunk')
eq(anchorInDiff([], 125, 130), null, 'no hunks for the file')
eq(anchorInDiff(H, null, null), null, 'no line (loose comment)')

// A review moved from PR #1925 to #1931: comments on #1925 are not "sent" here.
const U = 'https://github.com/o/r/pull/1925#discussion_r42'
eq(ghPrNumber(U), 1925, 'PR number from a comment link')
eq(ghPrNumber('https://x.atlassian.net/wiki/pages/1'), null, 'not a PR link')
eq(postedHere({ ghUrl: U }, 1925), true, 'posted on the PR it follows')
eq(postedHere({ ghUrl: U }, 1931), false, 'posted on a PR the review moved off')
eq(postedHere({ ghUrl: '' }, 1931), false, 'not posted')
eq(postedHere({ ghUrl: 'https://x.atlassian.net/wiki/pages/1' }, null), true, 'Confluence comment counts as posted')

console.log(bad ? `${bad}/${n} failed` : `code-review anchor: ${n} ok`)
process.exit(bad ? 1 : 0)
