/**
 * A paid SeeDream generation must refund the user when it fails AFTER the charge.
 *
 * Both generators deduct stars right after a successful model call, then save
 * the record and send the photo. If that delivery throws, the old code fell
 * straight to the outer catch and re-threw with no refund — the user paid for an
 * image they never received (refundUser was even imported but never called).
 *
 * These generators are integration-only (they reach Supabase and the model API,
 * so the file's own integration tests skip without a live env), so this asserts
 * the fix structurally, the same way protected-routes / no-raw-error do:
 *   - a refundOnFailure flag, default false;
 *   - set true only once the charge succeeded and it is not a welcome gift;
 *   - the outer catch calls refundUser when the flag is set.
 * refundUser itself is ledger-checked (it never refunds a welcome gift or more
 * than was paid), so the flag plus that check make a double refund impossible.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const FILES = [
  'src/services/generateSeeDream4.ts',
  'src/services/generateSeeDream45.ts',
]

describe('SeeDream generators refund a post-charge delivery failure', () => {
  for (const file of FILES) {
    describe(file, () => {
      const src = fs.readFileSync(file, 'utf8')

      it('imports refundUser (and actually calls it)', () => {
        expect(src).toMatch(/import \{ refundUser \}/)
        expect(src).toMatch(/refundUser\(/)
      })

      it('has a refundOnFailure flag defaulting to false', () => {
        expect(src).toMatch(/let refundOnFailure = false/)
      })

      it('arms the flag only after a real charge (not a welcome gift)', () => {
        expect(src).toMatch(
          /balanceDeduction\.success && !params\.is_welcome_gift[\s\S]{0,80}refundOnFailure = true/
        )
      })

      it('refunds in the outer catch when the flag is set', () => {
        expect(src).toMatch(/if \(refundOnFailure\)[\s\S]{0,240}refundUser\(/)
      })
    })
  }
})
