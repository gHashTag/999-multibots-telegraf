/**
 * A batch image failure must refund each failed image EXACTLY once.
 *
 * aiPhotoshopScene charges the whole batch once (N*costPerImage) then calls the
 * per-image services with skipBalanceCheck + chargedCostOverride=costPerImage.
 * generateSeedEdit3 and generateFluxKontextMax refunded in BOTH their inner and
 * outer catch WITHOUT a `refunded` flag. refundUser's netting compares a refund to
 * the single most-recent charge, so for N>=2 the lump charge N*cost absorbs two
 * per-image credits — the second refund is NOT refused → double-refund (the house
 * loses costPerImage per double-refunded image; no DB error required). Found by the
 * adversarial verification of #1649 (generateFluxKontextPro), which established the
 * `refunded`-flag pattern this mirrors.
 *
 * SeedEdit3 additionally ignores processBalanceOperation's result (like Pro), so it
 * also gets a `charged` gate to keep an uncharged (insufficient-funds) failure from
 * minting against an unrelated prior charge. Max already checks balanceCheck.success
 * and aborts, so it needs only the `refunded` flag.
 *
 * Integration-only services → structural assertions + mutation (their live tests
 * skip without env).
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

describe('sibling image services refund a batch failure at most once', () => {
  describe('generateSeedEdit3', () => {
    const src = fs.readFileSync('src/services/generateSeedEdit3.ts', 'utf8')

    it('has refunded + charged flags', () => {
      expect(src).toMatch(/let refunded = false/)
      expect(src).toMatch(/let charged = false/)
    })

    it('arms `charged` only on a real charge (success), true in batch mode', () => {
      expect(src).toMatch(/charged = balanceResult\.success === true/)
      expect(src).toMatch(/charged = true/)
    })

    it('inner replicate.run refund is charged-gated and sets refunded', () => {
      expect(src).toMatch(
        /if \(charged\) \{[\s\S]{0,60}refundUser\([\s\S]{0,220}refunded = true/
      )
    })

    it('outer refund is gated on !refunded && charged (no double, no mint)', () => {
      expect(src).toMatch(/if \(!refunded && charged[\s\S]{0,220}refundUser\(/)
    })

    it('the old ungated outer guard (totalCost>0 only) is gone', () => {
      expect(src).not.toMatch(/if \(totalCost > 0 && params\.ctx\)/)
    })
  })

  describe('generateFluxKontextMax', () => {
    const src = fs.readFileSync(
      'src/services/generateFluxKontextMax.ts',
      'utf8'
    )

    it('has refunded + charged flags', () => {
      expect(src).toMatch(/let refunded = false/)
      expect(src).toMatch(/let charged = false/)
    })

    it('arms `charged` only on a real charge / batch (not welcome gift / insufficient)', () => {
      // set after the balanceCheck.success gate, and in the skipBalanceCheck branch
      expect(src).toMatch(/charged = true/)
      expect(src).toMatch(
        /if \(params\.skipBalanceCheck && !params\.is_welcome_gift\) charged = true/
      )
    })

    it('inner save-failure refund is charged-gated and sets refunded', () => {
      expect(src).toMatch(
        /if \(charged\) \{[\s\S]{0,60}refundUser\([\s\S]{0,220}refunded = true/
      )
    })

    it('outer refund is gated on !refunded && charged (no double, no mint)', () => {
      expect(src).toMatch(/if \(!refunded && charged\)/)
    })

    it('the old guards (is_welcome_gift-only outer, ungated inner) are gone', () => {
      expect(src).not.toMatch(/if \(!params\.is_welcome_gift\) \{/)
      expect(src).not.toMatch(/if \(!refunded && !params\.is_welcome_gift\)/)
    })
  })
})
