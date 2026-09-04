/**
 * generateNeuroPhotoMulti must gate the FULL batch before charging.
 *
 * PLAN B bills each source image via a separate generateNeuroPhotoDirect and passes
 * bypass_payment_check=true for images 2..N. directPaymentProcessor with bypass=true
 * still INSERTS the charge — it only skips the `balance < amount` gate — so a user
 * who cannot afford the series was charged into the negative and got the extra
 * images for free (PLAN B is the only live path; PLAN A's server URL is unset in
 * prod). The loop also never stopped on failure. Found by the it.62 scout fan-out.
 *
 * Fix: fetch the balance once and refuse the whole series if it cannot afford
 * exactTotalCost (all N are charged, so all N must be affordable), and break on any
 * per-image failure so the bypass-gated remainder is not charged. Skip-only — never
 * adds a charge.
 *
 * Integration-only service -> structural assertions + mutation.
 *
 * The two branch assertions below used to be character windows
 * (`[\s\S]{0,500}`). A window is wrong in both directions: too narrow and it
 * reddens when unrelated code is inserted, too wide and it accepts a
 * `return null` belonging to a DIFFERENT function further down the file --
 * and this file has three of them (lines 159, 340, 429). `tri window-width`
 * showed the verdict flipping when the width was halved, which is proof the
 * constant was doing the work rather than the structure.
 *
 * The unit is now the branch itself: `ifElseBlocks` returns the consequent and
 * the alternate, so "the refusal returns null" is checked INSIDE the refusal.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const { blank } = require('../../../scripts/lib/blank-code.cjs')
const { ifElseBlocks } = require('../../../scripts/lib/call-args.cjs')

const src = fs.readFileSync('src/services/generateNeuroPhotoMulti.ts', 'utf8')
// Structure, not content: masking keeps offsets but blanks string bodies, so a
// `break` or `return null` mentioned inside a message cannot satisfy a rule.
const masked = blank(src)

describe('generateNeuroPhotoMulti gates the full batch before charging', () => {
  it('imports and calls getUserBalance', () => {
    expect(src).toMatch(/import \{ getUserBalance \}/)
    expect(src).toMatch(/getUserBalance\(telegram_id\)/)
  })

  it('refuses the whole series up front when it cannot afford exactTotalCost', () => {
    const gate = ifElseBlocks(
      masked,
      'if \\(currentBalance < exactTotalCost\\)'
    )
    expect(gate.consequent).not.toBe('')
    // The refusal must return from INSIDE the branch. A window would also
    // accept either of the two other `return null` in this file.
    expect(gate.consequent).toMatch(/return null/)
  })

  it('breaks the PLAN B loop on any per-image failure', () => {
    const step = ifElseBlocks(
      masked,
      'if \\(localResult && localResult\\.success\\)'
    )
    // Success collects; failure must STOP the series -- images 2..N carry
    // bypass_payment_check=true, so continuing would charge them ungated.
    expect(step.consequent).toMatch(/results\.push\(localResult\)/)
    expect(step.alternate).not.toBe('')
    expect(step.alternate).toMatch(/\bbreak\b/)
  })
})
