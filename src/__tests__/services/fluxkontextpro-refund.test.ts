/**
 * A paid FLUX Kontext Pro generation must refund the user when it fails AFTER the
 * charge — not only when the model call itself fails.
 *
 * The service deducts stars up front (processBalanceOperation, or the batch caller
 * via chargedCostOverride), calls replicate.run, then validates, saves and
 * DELIVERS the photo (ctx.replyWithPhoto). The inner replicate.run catch refunded,
 * but every post-generation step (validate / saveFileLocally / savePrompt /
 * replyWithPhoto) ran with NO refund and the outer catch only logged + rethrew.
 * Telegram's sendPhoto-by-URL fetches server-side and caps ~5MB, so 2K/4K PNG
 * output (the 4x/6x cost tiers) routinely fails delivery — i.e. the loss
 * concentrated on the MOST expensive requests. The sibling image services
 * (generateQwenImageEdit, generateFluxKontextMax) already refund in their outer
 * catch; Pro was the sole omission.
 *
 * This service is integration-only (reaches Supabase + the model API, its own live
 * tests skip without env), so this asserts the fix structurally — same style as
 * seedream-refund / neurophoto-direct-refund-on-delivery:
 *   - refundUser is imported and called;
 *   - totalCost is hoisted (let) so the outer catch can reference the amount;
 *   - the inner replicate.run catch sets `refunded = true` after refunding, so the
 *     outer refund never double-attempts;
 *   - the outer catch refunds `chargedCostOverride ?? totalCost` (the ACTUAL
 *     charge — batch base can differ from service base, #1266/#1267) only when
 *     `!refunded && totalCost > 0`.
 * refundUser is itself ledger-guarded (refuses when no MONEY_OUTCOME charge exists
 * in 24h, nets prior refunds under a per-user lock), so flag + guard make both a
 * mint and a double-refund impossible.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const FILE = 'src/services/generateFluxKontextPro.ts'
const src = fs.readFileSync(FILE, 'utf8')

describe('FLUX Kontext Pro refunds a post-charge delivery failure', () => {
  it('imports refundUser and actually calls it', () => {
    expect(src).toMatch(/import \{ refundUser \}/)
    expect(src).toMatch(/refundUser\(/)
  })

  it('hoists totalCost/refunded/charged so the outer catch can refund safely', () => {
    expect(src).toMatch(/let totalCost = 0/)
    expect(src).toMatch(/let refunded = false/)
    expect(src).toMatch(/let charged = false/)
  })

  it('arms `charged` only on a real charge (success), true in batch mode', () => {
    expect(src).toMatch(/charged = balanceResult\.success === true/)
    expect(src).toMatch(/charged = true/) // batch (skipBalanceCheck) branch
  })

  it('inner replicate.run refund is charged-gated and marks refunded=true', () => {
    // Both refund sites are gated on `charged` so neither mints on the
    // insufficient-funds path where the service continues uncharged.
    expect(src).toMatch(
      /if \(charged\) \{[\s\S]{0,60}refundUser\([\s\S]{0,240}refunded = true/
    )
  })

  it('refunds the actual charge in the outer catch, guarded against double AND mint', () => {
    // !refunded => no double with the inner catch; charged => never mint an
    // uncharged failure; chargedCostOverride ?? totalCost => the ACTUAL charge.
    expect(src).toMatch(
      /if \(!refunded && charged[\s\S]{0,300}refundUser\(\s*params\.ctx,\s*params\.chargedCostOverride \?\? totalCost/
    )
  })
})
