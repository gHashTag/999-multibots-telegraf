import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * A PAYMENT METHOD MAY BE OFFERED ONLY IF SOMETHING CAN CREDIT IT.
 *
 * x402 was offered to people while its receiving end was switched off on
 * purpose. Both halves were written down and neither knew about the other:
 *
 *   - routesAreMounted.test.ts lists x402.routes.ts as knowingly unmounted,
 *     "which is why x402CreditFailClosed currently guards code no request can
 *     enter";
 *   - the credit handlers themselves refuse with 501, because telegram_id and
 *     stars come from the request body and transaction_hash is only logged --
 *     crediting there would let anyone mint balance to any account.
 *
 * Measured in production on 2026-09-08: twelve X402 rows since December 2025,
 * every one PENDING, not one ever completed. The route census knew the endpoint
 * was dead. The payment census knew people were paying. Nobody joined them.
 *
 * The gate that decided whether to show the button was `isX402Configured`,
 * which asks whether a wallet address is a well-formed 0x string of 42
 * characters -- a question about a variable being SET, not about the path being
 * ALIVE. That distinction is the whole defect.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const GOOD_WALLET = '0x' + 'a'.repeat(40) // 42 chars, exactly what the config check wants

describe('x402 is not offered while nothing can credit it', () => {
  const saved = process.env.X402_WALLET_ADDRESS
  beforeEach(() => {
    process.env.X402_WALLET_ADDRESS = GOOD_WALLET
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.X402_WALLET_ADDRESS
    else process.env.X402_WALLET_ADDRESS = saved
    vi.resetModules()
  })

  it('a perfectly configured wallet still cannot credit', async () => {
    const { isX402Configured, canX402Credit, X402_SETTLEMENT_IMPLEMENTED } =
      await import('@/core/x402')

    // The positive control. Without it, "canX402Credit is false" would be
    // satisfied by a wallet that simply is not set, and would prove nothing
    // about the distinction this file exists to draw.
    expect(
      isX402Configured(),
      'the wallet must read as configured, or the contrast below is vacuous'
    ).toBe(true)

    expect(X402_SETTLEMENT_IMPLEMENTED).toBe(false)
    expect(
      canX402Credit(),
      'configured is not the same question as creditable'
    ).toBe(false)
  })

  it('no place that offers x402 decides it by asking whether a wallet is configured', () => {
    /*
     * BOTH DIRECTIONS, because the first version of this test had only one and
     * a mutation walked straight through it. It asserted that each file
     * MENTIONS canX402Credit -- and reverting the gate to isX402Configured left
     * the mention sitting in the import line, so all three tests still passed.
     * A file-wide `includes` cannot see which function the gate actually calls.
     *
     * The rule that can see it: in a file that offers x402, no decision may be
     * taken on isX402Configured. That also cost a line of pre-existing dead
     * code -- paymentScene computed `showCryptoButton` from isX402Configured
     * and never used it. Indistinguishable from the defect by any rule strong
     * enough to catch the defect, so it went.
     */
    const OFFERS = [
      'src/scenes/paymentScene/index.ts',
      'src/navigation/handlers/handlePaymentButtons.ts',
      'src/scenes/cryptoPaymentScene.ts',
    ]
    const DECIDES_ON_CONFIG =
      /(?:const\s+\w+\s*=\s*|if\s*\(\s*!?)isX402Configured\s*\(/
    const DECIDES_ON_CREDIT =
      /(?:const\s+\w+\s*=\s*|if\s*\(\s*!?)canX402Credit\s*\(/

    for (const rel of OFFERS) {
      const src = fs.readFileSync(path.join(REPO, rel), 'utf8')
      expect(
        DECIDES_ON_CREDIT.test(src),
        `${rel} decides whether to offer x402 and must take that decision on canX402Credit()`
      ).toBe(true)
      expect(
        DECIDES_ON_CONFIG.test(src),
        `${rel} takes a decision on isX402Configured(), which only says a wallet ` +
          `address is well formed -- not that a payment could ever be credited`
      ).toBe(false)
    }
  })

  it('the refusal hands over a live way to pay instead of naming one in prose', async () => {
    const src = fs.readFileSync(
      path.join(REPO, 'src/scenes/cryptoPaymentScene.ts'),
      'utf8'
    )
    // The defect being ratcheted is a refusal sent with no keyboard. The reply
    // that follows the guard must carry standardButtons -- the same helper the
    // shared money refusal uses, which puts top-up first.
    const guard = src.slice(src.indexOf('if (!canX402Credit())'))
    const reply = guard.slice(0, guard.indexOf('return ctx.scene.leave()'))
    expect(
      reply.includes('standardButtons(isRu)'),
      'the x402 refusal must offer a way to pay, not point at one in words'
    ).toBe(true)
  })
})
