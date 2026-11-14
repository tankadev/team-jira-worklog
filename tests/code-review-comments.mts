/**
 * Comments others left on a PR, as the review prompt shows them, and the
 * "already raised by" mark a finding can carry.
 *
 * Run: npx tsx --conditions=react-server tests/code-review-comments.mts
 */
import type { PullComment } from '@/lib/modules/code-review/github'
import { cleanRaisedBy } from '@/lib/modules/code-review/model'
import { commentsBlock } from '@/lib/modules/code-review/prompts'

let n = 0
let bad = 0
const ok = (cond: boolean, m: string) => {
  n++
  if (!cond) {
    bad++
    console.log('FAIL', m)
  }
}

const R = 'acme/app'
const url = (id: number) => `https://github.com/${R}/pull/7#discussion_r${id}`
const c = (o: Partial<PullComment> & { id: number }): PullComment => ({
  author: 'lan', body: 'x', path: '', line: null, createdAt: `2026-11-0${o.id}`, url: url(o.id), kind: 'inline', replyTo: null, ...o,
})

const list = [
  c({ id: 1, body: 'Force unwrap ở đây sẽ crash khi token nil', path: 'A.swift', line: 10 }),
  c({ id: 2, author: 'tuan', body: 'Đúng, sẽ sửa', replyTo: 1 }),
  c({ id: 3, author: 'me', body: 'comment app đã gửi' }),
  c({ id: 4, author: 'hung', kind: 'review', state: 'CHANGES_REQUESTED', body: 'Thiếu test cho case logout' }),
]
const out = commentsBlock(list, { viewer: 'ME', posted: new Set([url(3)]) })
ok(out.includes('Force unwrap') && out.includes(url(1)), 'inline comment shown with its link')
ok(/Force unwrap[^\n]*\n\s+↳ tuan: Đúng, sẽ sửa/.test(out), 'reply sits under its thread')
ok(!out.includes('comment app đã gửi'), 'what this review posted is left out')
ok(out.includes('review tổng (request changes)') && out.includes('Thiếu test'), 'review summary shown with its state')
ok(out.includes('raised_by'), 'tells Claude how to mark a repeat')
ok(commentsBlock([], { viewer: '', posted: new Set() }) === '', 'nothing said, no block')
ok(commentsBlock([c({ id: 5, author: 'Me' })], { viewer: 'me', posted: new Set() }).includes('(chính người review)'), "reviewer's own manual comment is labelled")

ok(cleanRaisedBy({ author: '@lan', url: url(1), note: 'trùng' }, R)?.author === 'lan', 'raised_by kept, @ dropped')
ok(cleanRaisedBy({ author: 'lan', url: 'https://evil.example/x' }, R) === null, 'link off this repo is dropped')
ok(cleanRaisedBy({ author: '', url: url(1) }, R) === null, 'no author, no mark')
ok(cleanRaisedBy('nonsense', R) === null, 'garbage is dropped')

console.log(bad ? `${bad}/${n} failed` : `code-review comments: ${n} ok`)
process.exit(bad ? 1 : 0)
