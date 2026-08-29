/**
 * generateNeuroPhotoDirect must refund a delivery failure, not just a generation
 * failure.
 *
 * It charges the full cost up front (MONEY_OUTCOME), then delivers each image via
 * ctx.telegram.sendPhoto. That send routinely throws (Telegram can't fetch the
 * remote URL, size limit, 429, user blocked). The send catch used to only LOG,
 * so execution fell through to savePrompt('success') and the user was told
 * "Done" — charged, no image, no refund. The refund lived only in the
 * generation-failure catch, which a swallowed delivery error never reaches.
 *
 * The service reaches Supabase and the model API and isn't exported, so this
 * asserts the fix structurally, mutation-checked: the sendUserError catch issues
 * a REFUND (a refund only ever returns money, so this is the safe direction).
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const SRC = fs.readFileSync('src/services/generateNeuroPhotoDirect.ts', 'utf8')

describe('neuroPhotoDirect refunds a delivery failure', () => {
  it('the sendUserError (delivery) catch issues a REFUND', () => {
    const catchIdx = SRC.indexOf('catch (sendUserError)')
    expect(catchIdx, 'delivery catch not found').toBeGreaterThan(-1)
    // the next catch after it bounds this block
    const nextCatchIdx = SRC.indexOf('} catch (', catchIdx + 1)
    const block = SRC.slice(catchIdx, nextCatchIdx)
    expect(
      block,
      'delivery catch does not refund — a swallowed send failure leaves the user charged'
    ).toContain('PaymentType.REFUND')
  })
})
