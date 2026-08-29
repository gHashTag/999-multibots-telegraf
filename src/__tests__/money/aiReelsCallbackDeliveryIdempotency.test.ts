/**
 * AI Reels render callbacks (POST /api/telegram/ai-reels-callback) are delivered
 * at-least-once. verifyCallbackToken checks the RECIPIENT (right telegram_id),
 * not duplicates, so a provider retry re-enters handleCompletedRender and
 * re-sends the finished video + completion keyboard. The callback does not charge
 * (billing happens at generation start), so the harm is a duplicate delivery, not
 * a double charge — but it is still user-visible.
 *
 * The fix mirrors the kie/sora webhook (#1240) and the sibling poller
 * (handleTextToVideoDirect.ts): a bounded module-scope delivered-set claimed
 * synchronously by the immutable job_id before any delivery await.
 *
 * Source-level seam test (delivery is behind live Telegram I/O; a behavioral test
 * cannot force the concurrent double-send and would be a false ruler). Mutation —
 * dropping the set, the per-function claim, or the FIFO bound — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'api_server',
  'routes',
  'ai-reels-callback.routes.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

function fnBody(s: string, decl: string): string {
  const start = s.indexOf(decl)
  if (start < 0) return ''
  const next = s.indexOf('\nasync function ', start + decl.length)
  return s.slice(start, next < 0 ? s.length : next)
}

describe('ai-reels callback video delivery is idempotent per job', () => {
  it('sources the shared delivery claimer from the util (bound tested there)', () => {
    const s = code()
    expect(
      /from '@\/helpers\/videoDeliveryIdempotency'/.test(s),
      'does not import the shared delivery-idempotency util'
    ).toBe(true)
    expect(
      /const claimVideoJobDelivery = createVideoDeliveryClaimer\(\)/.test(s),
      'does not instantiate the shared delivery claimer'
    ).toBe(true)
  })

  it('claims delivery BEFORE sendVideo in handleCompletedRender', () => {
    const s = code()
    const body = fnBody(s, 'async function handleCompletedRender')
    expect(body.length, 'handleCompletedRender not found').toBeGreaterThan(0)
    const claim = body.search(/claimVideoJobDelivery\(payload\.job_id\)/)
    const send = body.indexOf('sendVideo(')
    expect(claim, 'no claimVideoJobDelivery(payload.job_id)').toBeGreaterThan(
      -1
    )
    expect(send, 'no sendVideo in handleCompletedRender').toBeGreaterThan(-1)
    expect(claim, 'claim must run BEFORE sendVideo').toBeLessThan(send)
  })
})
