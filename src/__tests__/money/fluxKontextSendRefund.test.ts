/**
 * generateFluxKontext charges the user (processBalanceOperation, costPerImage)
 * BEFORE sending the edited image. If ctx.telegram.sendPhoto throws (403 blocked
 * bot, network, caption/file-too-large), the inner `catch (photoError)` only logs
 * and notifies — it deliberately does NOT rethrow ("НЕ выбрасываем ошибку") — and
 * execution falls through to the success `return { image, prompt_id }`. So the
 * OUTER catch's refund never runs and the debit stands with no image delivered
 * (same charged-no-refund class as faceSwap #1166 / gemini #1180).
 *
 * The fix refunds INSIDE the photoError catch, gated on a real charge
 * (paymentAmount > 0), via the same refundUser the outer catch uses. refundUser
 * is idempotent (hasChargeToRefund: real MONEY_OUTCOME within 24h, nets prior
 * refunds, under a per-user lock), so it is additive and cannot double-credit.
 *
 * Source-level seam test (the service is a 1390-line provider/Telegram I/O
 * function; a full behavioral wiring is brittle). The assertion is bounded to
 * the photoError catch region — BEFORE the success return — so the pre-existing
 * OUTER-catch refund (which is after the return and keyed on `error`, not
 * `photoError`) cannot satisfy it. Mutation — deleting the added refund, or
 * ungating it — fails the test.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'services',
  'generateFluxKontext.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('generateFluxKontext refunds a send failure (no charged-no-refund)', () => {
  it('refunds via refundUser INSIDE the photoError catch, before the success return', () => {
    const s = code()
    const c = s.indexOf('catch (photoError)')
    expect(c, 'no photoError catch block').toBeGreaterThan(-1)
    const ret = s.indexOf('return { image, prompt_id }', c)
    expect(ret, 'no success return after the photoError catch').toBeGreaterThan(
      c
    )
    const block = s.slice(c, ret) // the send-failure region, excluding the outer catch
    expect(
      /refundUser\(/.test(block),
      'a send failure does not refund (the debit stands with no image)'
    ).toBe(true)
  })

  it('gates the send-failure refund on a real charge (no mint)', () => {
    const s = code()
    const c = s.indexOf('catch (photoError)')
    const ret = s.indexOf('return { image, prompt_id }', c)
    const block = s.slice(c, ret)
    expect(
      /paymentAmount > 0/.test(block),
      'the send-failure refund is not gated on a real charge'
    ).toBe(true)
  })
})
