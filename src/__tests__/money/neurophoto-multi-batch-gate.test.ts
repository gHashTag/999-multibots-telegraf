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
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'

const src = fs.readFileSync('src/services/generateNeuroPhotoMulti.ts', 'utf8')

describe('generateNeuroPhotoMulti gates the full batch before charging', () => {
  it('imports and calls getUserBalance', () => {
    expect(src).toMatch(/import \{ getUserBalance \}/)
    expect(src).toMatch(/getUserBalance\(telegram_id\)/)
  })

  it('refuses the whole series up front when it cannot afford exactTotalCost', () => {
    expect(src).toMatch(
      /if \(currentBalance < exactTotalCost\)[\s\S]{0,500}return null/
    )
  })

  it('breaks the PLAN B loop on any per-image failure', () => {
    expect(src).toMatch(
      /results\.push\(localResult\)[\s\S]{0,60}\} else \{[\s\S]{0,360}break/
    )
  })
})
