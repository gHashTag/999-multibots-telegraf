import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * POST /api/feed/:id/like must record the like for the VERIFIED caller, not for
 * a telegram_id taken from the request body.
 *
 * WHAT WAS WRONG. The handler read `payload.telegram_id ?? payload.user_id` and
 * wrote a per-user row (template_likes keyed by telegram_id). The route is not
 * public, so the guard required a credential — but the handler never asked who
 * the credential belonged to. A signed-in user could POST another user's
 * telegram_id and forge a like on their behalf, or (the toggle unlikes on a
 * repeat) remove theirs; and since likes_count is COUNT(*) over the table,
 * posting many distinct forged ids inflates a template's like count.
 *
 * The mini-app already signs this request (apiFetch attaches
 * X-Telegram-Init-Data), so using the verified id costs legit callers nothing —
 * their body telegram_id equalled their own id anyway. Same class as #975 /
 * #983 / #985. view and use are anonymous counters and are left alone.
 *
 * Source-level like the other seam tests here — it checks that the like path
 * takes identity from the signature, not the body.
 */

const SERVER = path.join(__dirname, 'render-server.ts')
const HEAD = '/^\\/api\\/feed\\/(\\d+)\\/(like|view|use)$/'

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

function handlerBody(): string {
  const src = fs.readFileSync(SERVER, 'utf8')
  const start = src.indexOf(HEAD)
  if (start === -1) return ''
  const rest = src.slice(start)
  const end = rest.indexOf('\n    const ')
  // the like/view/use block is sizable; take a generous window to the next
  // top-level route or 6k chars, whichever first
  const nextRoute = rest.indexOf('feedPath ===')
  const cut = Math.min(
    ...[rest.indexOf('\n  if (req.url'), 6000].filter(i => i > 0)
  )
  return stripComments(rest.slice(0, cut))
}

describe('feed/:id/like records the like for the verified caller', () => {
  it('the handler is found — otherwise the checks below are empty', () => {
    expect(handlerBody().length).toBeGreaterThan(0)
  })

  it('derives the liker from the signature, not the body', () => {
    const body = handlerBody()
    // identity must come from the verified caller
    const viaSig =
      body.includes('chatIdentity(') || body.includes('verifiedTelegramId(')
    expect(viaSig, 'like handler does not read a verified identity').toBe(true)
    // and must NOT derive the actor from the body
    const viaBody = /payload\.telegram_id|payload\.user_id/.test(body)
    expect(viaBody, 'like handler still reads telegram_id from the body').toBe(
      false
    )
  })

  it('the telegramId written to template_likes is the verified one', () => {
    const body = handlerBody()
    const idFromWho = body.search(/const telegramId = who\b/)
    const insert = body.indexOf('template_likes')
    expect(
      idFromWho,
      'telegramId is not derived from the verified caller'
    ).toBeGreaterThan(-1)
    expect(insert, 'template_likes write not found').toBeGreaterThan(-1)
    expect(idFromWho, 'identity is derived after the write').toBeLessThan(
      insert
    )
  })
})
