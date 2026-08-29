/**
 * Feed personalization (is_liked / is_starred) must be scoped to the VERIFIED
 * viewer, not to a query parameter.
 *
 * WHAT WAS WRONG. GET /api/feed and GET /api/feed/:id read the viewer id as
 * `url.searchParams.get('user_id')` and bound it into the template_likes /
 * template_stars LEFT JOINs. /api/feed is on the public GET list, so an
 * unauthenticated caller could pass ?user_id=<victim> and read back which posts
 * that victim had liked or starred — a cross-user disclosure. Same class as
 * #975 / #983 / #985 / #901: identity present, taken from the caller's word.
 *
 * The id now comes from verifiedViewerId(req), which trusts only signed Telegram
 * initData (an anonymous or unverified caller gets null, so the joins match
 * nothing). Source-level seam test like the other render tests here: it pins
 * that the feed reads no longer trust the query, which a refactor could drop.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(__dirname, 'render-server.ts')

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('feed personalization is scoped to the verified viewer (IDOR)', () => {
  it('defines verifiedViewerId and it trusts only signed initData', () => {
    const s = code()
    expect(/function verifiedViewerId\s*\(/.test(s)).toBe(true)
    // The helper must gate on a verified signature, not just read a header.
    const body = s.slice(s.indexOf('function verifiedViewerId'))
    expect(
      /verifyTelegramInitData\s*\([^)]*\)\.ok/.test(body.slice(0, 400)),
      'verifiedViewerId does not verify the initData signature'
    ).toBe(true)
  })

  it('both feed reads take the viewer id from verifiedViewerId, not the query', () => {
    const s = code()
    // The two feed handlers assign the personalization id from the helper...
    const helperReads = (
      s.match(/const userId = verifiedViewerId\(req\)/g) || []
    ).length
    expect(
      helperReads,
      'expected both feed reads to use verifiedViewerId'
    ).toBe(2)
    // ...and no feed read still binds a query user_id into `userId`.
    expect(
      s.includes("const userId = url.searchParams.get('user_id')"),
      'a feed read still trusts the query user_id'
    ).toBe(false)
  })
})
